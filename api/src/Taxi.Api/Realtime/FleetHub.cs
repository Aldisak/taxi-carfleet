using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Common.Geo;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Realtime;

/// <summary>Real-time SignalR hub for the fleet dispatch system.
/// Mounted at <c>/hubs/fleet</c>. Requires JWT authentication (passed via query-string
/// <c>access_token</c> for SignalR WebSocket connections, or via Authorization header for
/// Long Polling — both paths are handled by the <c>OnMessageReceived</c> hook in Program.cs).
/// <para>
/// <b>Tenant isolation:</b> SignalR creates a fresh DI scope per hub method invocation.
/// <c>TenantResolutionMiddleware</c> only runs on the initial HTTP negotiation request so its
/// <c>CurrentTenant</c> value is NOT carried into hub method scopes. Every hub method that
/// touches the DB must set <c>currentTenant.FleetId</c> from the JWT <c>fleet_id</c> claim
/// before querying, or call <c>IgnoreQueryFilters()</c> with an explicit tenant predicate.
/// </para>
/// <para>
/// <b>Groups:</b>
/// <list type="bullet">
///   <item><c>fleet:{fleetId}:dispatch</c> — Dispatcher and FleetAdmin users.</item>
///   <item><c>driver:{driverId}</c> — A single driver (receives offers, status acks).</item>
///   <item><c>order:{orderId}</c> — Customer tracking a specific ride (joined via <see cref="Subscribe"/>).</item>
/// </list>
/// </para>
/// <para>
/// <b>Non-driver UpdatePosition:</b> silently ignored (debug log, no exception) to avoid
/// leaking role information to the caller.
/// </para>
/// <para>
/// <b>Non-owner Subscribe:</b> silently ignored (debug log, no exception) to avoid leaking
/// order existence information to the caller.
/// </para>
/// </summary>
[Authorize]
internal sealed class FleetHub(
    TaxiDbContext dbContext,
    CurrentTenant currentTenant,
    DriverPositionStore positionStore,
    OrderSubscriptionTracker subscriptionTracker,
    PickupEtaService pickupEtaService,
    IServiceScopeFactory scopeFactory,
    TimeProvider timeProvider,
    ILogger<FleetHub> logger) : Hub
{
    /// <summary>Called when a client connects. Dispatchers and FleetAdmins automatically join
    /// the fleet dispatch group; drivers automatically join their personal group.</summary>
    public override async Task OnConnectedAsync()
    {
        SetTenantFromClaims();
        var role = GetRole();
        var fleetId = GetFleetId();

        if (role is UserRole.Dispatcher or UserRole.FleetAdmin && fleetId.HasValue)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, DispatchGroup(fleetId.Value),
                Context.ConnectionAborted);
            logger.LogDebug("Dispatcher connected {ConnectionId} {FleetId}", Context.ConnectionId, fleetId);
        }
        else if (role == UserRole.Driver)
        {
            var driverId = await ResolveDriverIdAsync();
            if (driverId.HasValue)
            {
                await Groups.AddToGroupAsync(Context.ConnectionId, DriverGroup(driverId.Value),
                    Context.ConnectionAborted);
                Context.Items["DriverId"] = driverId.Value;
                logger.LogDebug("Driver connected {ConnectionId} {DriverId}", Context.ConnectionId, driverId);
            }
        }

        await base.OnConnectedAsync();
    }

    /// <summary>Called when a client disconnects. Cleans up position store state for drivers
    /// and removes any order-group subscriptions tracked by <see cref="OrderSubscriptionTracker"/>.</summary>
    public override Task OnDisconnectedAsync(Exception? exception)
    {
        if (Context.Items.TryGetValue("DriverId", out var driverIdObj) && driverIdObj is Guid driverId)
        {
            positionStore.Remove(driverId);
        }

        // Clean up order subscriptions so viewer counts remain accurate.
        subscriptionTracker.RemoveConnection(Context.ConnectionId);

        return base.OnDisconnectedAsync(exception);
    }

    /// <summary>Customer subscribes to position and status updates for a specific order.
    /// Joins the <c>order:{orderId}</c> group only when the caller owns the order.
    /// Non-owners are silently refused (no error, no group join) to avoid existence leaks.
    /// <para>
    /// Customer JWTs carry no <c>fleet_id</c> claim, so tenant resolution from claims is
    /// not possible. The ownership query uses <c>IgnoreQueryFilters()</c> with an explicit
    /// <c>o.Id == orderId &amp;&amp; o.CustomerUserId == sub</c> predicate which is tenant-safe
    /// by construction (only the true owner can satisfy both conditions).
    /// </para>
    /// </summary>
    /// <param name="orderId">The order to subscribe to.</param>
    public async Task Subscribe(Guid orderId)
    {
        var sub = GetSub();
        if (sub is null)
        {
            logger.LogDebug("Subscribe refused — no sub claim {ConnectionId}", Context.ConnectionId);
            return;
        }

        // Use IgnoreQueryFilters because customer tokens carry no fleet_id claim.
        // The predicate is tenant-safe by construction.
        var owns = await dbContext.Orders
            .IgnoreQueryFilters()
            .AnyAsync(o => o.Id == orderId && o.CustomerUserId == sub.Value,
                Context.ConnectionAborted);

        if (!owns)
        {
            logger.LogDebug("Subscribe refused — not owner {ConnectionId} {OrderId} {Reason}",
                Context.ConnectionId, orderId, "NotOwner");
            return;
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, OrderGroup(orderId),
            Context.ConnectionAborted);
        subscriptionTracker.Add(Context.ConnectionId, orderId);
        logger.LogDebug("Customer subscribed {ConnectionId} {OrderId}", Context.ConnectionId, orderId);
    }

    /// <summary>Drivers report their current GPS position. Throttled to ≤ 1 accepted update per 3 s
    /// per driver (server-side). Non-driver callers are silently ignored.
    /// <para>
    /// When the update is accepted:
    /// <list type="bullet">
    ///   <item>The in-memory <see cref="DriverPositionStore"/> is updated immediately.</item>
    ///   <item><c>DriverPositionChanged</c> is broadcast immediately to the fleet dispatch group
    ///     and to the <c>order:{orderId}</c> group of the driver's active order (if any).</item>
    ///   <item>On the first accepted update or every 30 s thereafter, <c>Driver.LastLat/Lng/PositionAt</c>
    ///     is flushed to the DB.</item>
    /// </list>
    /// </para>
    /// </summary>
    /// <param name="lat">Latitude.</param>
    /// <param name="lng">Longitude.</param>
    /// <param name="heading">Heading in degrees (0–360). Null if unknown.</param>
    /// <param name="speed">Speed in km/h. Null if unknown.</param>
    public async Task UpdatePosition(double lat, double lng, double? heading, double? speed)
    {
        var role = GetRole();
        if (role != UserRole.Driver)
        {
            logger.LogDebug("UpdatePosition ignored — not a driver {ConnectionId} {Reason}",
                Context.ConnectionId, "NotDriver");
            return;
        }

        SetTenantFromClaims();
        var fleetId = GetFleetId();
        if (!fleetId.HasValue)
        {
            logger.LogDebug("UpdatePosition ignored — no fleet_id {ConnectionId}", Context.ConnectionId);
            return;
        }

        var driverId = await ResolveDriverIdCachedAsync();
        if (!driverId.HasValue)
        {
            logger.LogDebug("UpdatePosition ignored — driver not found {ConnectionId}", Context.ConnectionId);
            return;
        }

        var (accepted, flushDue) = positionStore.TryUpdate(
            driverId.Value, lat, lng, heading, speed);

        if (!accepted)
            return;

        var at = timeProvider.GetUtcNow();

        // Broadcast to fleet dispatch group immediately.
        var dispatchGroup = DispatchGroup(fleetId.Value);
        var positionPayload = new { driverId = driverId.Value, lat, lng, heading, speed, at };
        await Clients.Group(dispatchGroup)
            .SendAsync("DriverPositionChanged", positionPayload, Context.ConnectionAborted);

        // Broadcast to the driver's active order group (if any) and refresh ETA.
        var activeOrder = await GetActiveOrderAsync(driverId.Value);
        if (activeOrder is not null)
        {
            await Clients.Group(OrderGroup(activeOrder.Id))
                .SendAsync("DriverPositionChanged", positionPayload, Context.ConnectionAborted);

            // Refresh pickup ETA for customer viewer (Accepted status means en-route to pickup).
            if (activeOrder.Status == OrderStatus.Accepted)
            {
                await pickupEtaService.RefreshEtaAsync(
                    activeOrder.Id, activeOrder.FleetId,
                    lat, lng,
                    activeOrder.PickupLat, activeOrder.PickupLng,
                    speed,
                    Context.ConnectionAborted);
            }
        }

        // Flush Driver.LastLat/Lng/PositionAt to DB when due.
        if (flushDue)
        {
            await FlushPositionToDatabaseAsync(driverId.Value, lat, lng, at);
        }

        logger.LogDebug("UpdatePosition accepted {DriverId} {Lat} {Lng}", driverId, lat, lng);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /// <summary>Sets the current tenant from the JWT <c>fleet_id</c> claim. Must be called at the
    /// start of any hub method that queries the DB through global query filters.</summary>
    private void SetTenantFromClaims()
    {
        var fleetId = GetFleetId();
        if (fleetId.HasValue)
            currentTenant.FleetId = fleetId;
    }

    private Guid? GetFleetId()
    {
        var claim = Context.User?.FindFirst(TenantClaims.FleetId)?.Value;
        return Guid.TryParse(claim, out var id) ? id : null;
    }

    private Guid? GetSub()
    {
        var claim = Context.User?.FindFirst("sub")?.Value;
        return Guid.TryParse(claim, out var id) ? id : null;
    }

    private UserRole? GetRole()
    {
        var claim = Context.User?.FindFirst("role")?.Value;
        return Enum.TryParse<UserRole>(claim, out var role) ? role : null;
    }

    /// <summary>Looks up the driver row for the current user's <c>sub</c> claim via the DB.</summary>
    private async Task<Guid?> ResolveDriverIdAsync()
    {
        var sub = GetSub();
        if (!sub.HasValue) return null;

        var driver = await dbContext.Drivers.AsNoTracking()
            .FirstOrDefaultAsync(d => d.UserId == sub.Value, Context.ConnectionAborted);
        return driver?.Id;
    }

    /// <summary>Returns the cached driver ID from <c>Context.Items</c> if available;
    /// otherwise resolves from DB and caches it.</summary>
    private async Task<Guid?> ResolveDriverIdCachedAsync()
    {
        if (Context.Items.TryGetValue("DriverId", out var cached) && cached is Guid cachedId)
            return cachedId;

        var driverId = await ResolveDriverIdAsync();
        if (driverId.HasValue)
            Context.Items["DriverId"] = driverId.Value;

        return driverId;
    }

    /// <summary>Returns the active order data for a driver (one of Accepted/Arrived/InProgress):
    /// order ID, fleet ID, and pickup coordinates. Returns null when the driver has no active order.</summary>
    private async Task<ActiveOrderInfo?> GetActiveOrderAsync(Guid driverId)
    {
        var activeStatuses = new[] { OrderStatus.Accepted, OrderStatus.Arrived, OrderStatus.InProgress };
        var order = await dbContext.Orders.AsNoTracking()
            .Where(o => o.DriverId == driverId && activeStatuses.Contains(o.Status))
            .Select(o => new { o.Id, o.FleetId, o.PickupLat, o.PickupLng, o.Status })
            .FirstOrDefaultAsync(Context.ConnectionAborted);
        return order is null ? null
            : new ActiveOrderInfo(order.Id, order.FleetId, order.PickupLat, order.PickupLng, order.Status);
    }

    private record ActiveOrderInfo(Guid Id, Guid FleetId, double PickupLat, double PickupLng, OrderStatus Status);

    /// <summary>Flushes the driver position to the database using a new DI scope (the hub's
    /// scoped DbContext may have been disposed after the hub method completes).
    /// Uses <c>CancellationToken.None</c> so the flush completes even when the client has
    /// disconnected and <see cref="Hub.Context"/>.<see cref="Microsoft.AspNetCore.SignalR.HubCallerContext.ConnectionAborted"/>
    /// has been signalled — the write must survive the connection abort.</summary>
    private async Task FlushPositionToDatabaseAsync(Guid driverId, double lat, double lng, DateTimeOffset at)
    {
        try
        {
            await using var scope = scopeFactory.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

            // IgnoreQueryFilters because we need to update the driver row directly.
            // CancellationToken.None: flush must complete even if the connection is aborted.
            var driver = await db.Drivers
                .IgnoreQueryFilters()
                .FirstOrDefaultAsync(d => d.Id == driverId, CancellationToken.None);
            if (driver is null) return;

            driver.LastLat = lat;
            driver.LastLng = lng;
            driver.LastPositionAt = at;
            await db.SaveChangesAsync(CancellationToken.None);

            logger.LogDebug("Position flushed {DriverId} {Lat} {Lng}", driverId, lat, lng);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Position flush failed {DriverId}", driverId);
        }
    }

    // ── Group name helpers ────────────────────────────────────────────────────

    /// <summary>Returns the dispatch group name for a fleet.</summary>
    private static string DispatchGroup(Guid fleetId) => $"fleet:{fleetId}:dispatch";

    /// <summary>Returns the driver personal group name.</summary>
    private static string DriverGroup(Guid driverId) => $"driver:{driverId}";

    /// <summary>Returns the order tracking group name.</summary>
    private static string OrderGroup(Guid orderId) => $"order:{orderId}";
}

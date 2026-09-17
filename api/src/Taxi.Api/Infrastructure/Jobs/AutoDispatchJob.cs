using Microsoft.EntityFrameworkCore;
using Taxi.Api.Common.Dispatch;
using Taxi.Api.Common.Orders;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Infrastructure.Jobs;

/// <summary>Hosted service that polls every 5 s for <see cref="OrderStatus.New"/> orders
/// in fleets with <c>AutoDispatchEnabled = true</c>, selects the nearest eligible online driver
/// via <see cref="NearestDriverSelector"/>, and applies the <see cref="OrderTransition.Assign"/>
/// transition via <see cref="OrderService"/>.
/// <para>
/// <b>Gating:</b> auto-dispatch is purely opt-in per fleet — a missing <c>FleetSettings</c> row
/// or <c>AutoDispatchEnabled = false</c> means the fleet is never touched. Unlike
/// <see cref="OfferTimeoutJob"/> there is no safe default for a missing row.
/// </para>
/// <para>
/// <b>Exclusion set (design-review F-1):</b> drivers already recorded in Declined or Timeout
/// event payloads for the order are excluded, as are drivers who are the current <c>DriverId</c>
/// of any <c>Assigned</c> order in the fleet. The latter is the <b>sole within-tick guard</b> —
/// because orders are processed sequentially in fresh scopes that commit before the next order,
/// a prior tick's commit is visible when the next order re-queries the exclusion set.
/// </para>
/// <para>
/// <b>Testability:</b> all business logic lives in <see cref="RunTickAsync"/>. <c>ExecuteAsync</c>
/// is a thin PeriodicTimer shell. Tests call <c>RunTickAsync</c> directly — deterministic, no timer waits.
/// </para>
/// </summary>
internal sealed class AutoDispatchJob(
    IServiceScopeFactory scopeFactory,
    TimeProvider timeProvider,
    ILogger<AutoDispatchJob> logger) : BackgroundService
{
    private static readonly TimeSpan TickInterval = TimeSpan.FromSeconds(5);
    private static readonly TimeSpan StaleThreshold = TimeSpan.FromMinutes(5);

    /// <inheritdoc />
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TickInterval, timeProvider);

        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                await RunTickAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Tick failed {Reason}", "UnhandledTickException");
            }
        }
    }

    /// <summary>Performs one scan-and-dispatch tick. Called by <c>ExecuteAsync</c> and directly
    /// by integration tests for deterministic execution without a timer.</summary>
    /// <param name="ct">Cancellation token.</param>
    public async Task RunTickAsync(CancellationToken ct)
    {
        var now = timeProvider.GetUtcNow();

        // Scan phase: one scope, read-only, cross-tenant via IgnoreQueryFilters.
        // Project (OrderId, FleetId, PickupLat, PickupLng, CreatedAt, ScheduledAt) + per-fleet settings.
        // CreatedAt and ScheduledAt added per design-review F-2 for in-memory filtering.
        // The (bool?), (int?), (int?) casts ensure null is returned when no FleetSettings row exists,
        // so a missing row → skip (no safe default), matching opt-in semantics.
        List<(Guid OrderId, Guid FleetId, double PickupLat, double PickupLng,
              DateTimeOffset CreatedAt, DateTimeOffset? ScheduledAt,
              bool? AutoDispatchEnabled, int? AfterSeconds, int? MaxRadiusKm)> candidates;

        await using (var scanScope = scopeFactory.CreateAsyncScope())
        {
            var scanDb = scanScope.ServiceProvider.GetRequiredService<TaxiDbContext>();

            var rows = await scanDb.Orders.IgnoreQueryFilters()
                .AsNoTracking()
                .Where(o => o.Status == OrderStatus.New)
                .Select(o => new
                {
                    o.Id,
                    o.FleetId,
                    o.PickupLat,
                    o.PickupLng,
                    o.CreatedAt,
                    o.ScheduledAt,
                    // Cast to nullable so that when no FleetSettings row exists, FirstOrDefault
                    // returns null (not false/0 — the bool/int default) and in-memory gating skips the order.
                    AutoDispatchEnabled = (bool?)scanDb.FleetSettings
                        .IgnoreQueryFilters()
                        .Where(fs => fs.FleetId == o.FleetId)
                        .Select(fs => (bool?)fs.AutoDispatchEnabled)
                        .FirstOrDefault(),
                    AfterSeconds = (int?)scanDb.FleetSettings
                        .IgnoreQueryFilters()
                        .Where(fs => fs.FleetId == o.FleetId)
                        .Select(fs => (int?)fs.AutoDispatchAfterSeconds)
                        .FirstOrDefault(),
                    MaxRadiusKm = (int?)scanDb.FleetSettings
                        .IgnoreQueryFilters()
                        .Where(fs => fs.FleetId == o.FleetId)
                        .Select(fs => (int?)fs.MaxOfferRadiusKm)
                        .FirstOrDefault()
                })
                .ToListAsync(ct);

            // Filter in memory:
            // 1. AutoDispatchEnabled must be true (null = no row → skip).
            // 2. CreatedAt + AfterSeconds <= now (elapsed waiting period).
            // 3. ScheduledAt == null or ScheduledAt <= now (not a future-scheduled ride).
            candidates = rows
                .Where(r => r.AutoDispatchEnabled == true
                         && r.AfterSeconds.HasValue
                         && r.CreatedAt.AddSeconds(r.AfterSeconds.Value) <= now
                         && (r.ScheduledAt == null || r.ScheduledAt.Value <= now))
                .Select(r => (r.Id, r.FleetId, r.PickupLat, r.PickupLng,
                              r.CreatedAt, r.ScheduledAt, r.AutoDispatchEnabled, r.AfterSeconds, r.MaxRadiusKm))
                .ToList();
        }

        // Dispatch phase: one scope per order — avoids a poisoned change-tracker on StaleVersion.
        foreach (var (orderId, fleetId, pickupLat, pickupLng, _, _, _, _, maxRadiusKm) in candidates)
        {
            try
            {
                await DispatchOrderAsync(orderId, fleetId, pickupLat, pickupLng, maxRadiusKm!.Value, now, ct);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning(ex, "Auto-dispatch failed {OrderId} {Reason}",
                    orderId, "PerOrderException");
            }
        }
    }

    /// <summary>Attempts to auto-dispatch a single order using a fresh scoped context.
    /// Builds the exclusion set from Declined/Timeout event payloads and currently-Assigned drivers,
    /// selects the nearest eligible driver, and calls <see cref="OrderService.TransitionAsync"/>.</summary>
    private async Task DispatchOrderAsync(
        Guid orderId, Guid fleetId,
        double pickupLat, double pickupLng,
        int maxRadiusKm,
        DateTimeOffset now,
        CancellationToken ct)
    {
        await using var scope = scopeFactory.CreateAsyncScope();

        // Set tenant so EF query filters work correctly for this fleet.
        var tenant = scope.ServiceProvider.GetRequiredService<CurrentTenant>();
        tenant.FleetId = fleetId;

        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        // Build exclusion set (design-review F-1: queried INSIDE per-order scope so prior same-tick
        // commits by earlier orders in the loop are visible via the tenant-filtered reads).

        // Part 1: drivers recorded in Declined or Timeout payloads for this order.
        // Must load events with ToListAsync FIRST, then parse payloads in memory
        // (cannot project JsonDocument members inside a LINQ Select — CLAUDE.md trap).
        var previousEvents = await db.OrderEvents
            .AsNoTracking()
            .Where(e => e.OrderId == orderId
                     && (e.Type == OrderEventType.Declined || e.Type == OrderEventType.Timeout))
            .ToListAsync(ct);

        var excludedDriverIds = new HashSet<Guid>();
        foreach (var ev in previousEvents)
        {
            if (ev.Payload is null) continue;
            var root = ev.Payload.RootElement;

            if (ev.Type == OrderEventType.Declined
                && root.TryGetProperty("declinedDriverId", out var declinedProp)
                && declinedProp.TryGetGuid(out var declinedId))
            {
                excludedDriverIds.Add(declinedId);
            }
            else if (ev.Type == OrderEventType.Timeout
                && root.TryGetProperty("timedOutDriverId", out var timedOutProp)
                && timedOutProp.TryGetGuid(out var timedOutId))
            {
                excludedDriverIds.Add(timedOutId);
            }
        }

        // Part 2: drivers currently holding a pending Assigned offer in this fleet.
        // This is the sole within-tick guard preventing double-assignment (Assumption 6).
        var assignedDriverIds = await db.Orders
            .AsNoTracking()
            .Where(o => o.Status == OrderStatus.Assigned && o.DriverId != null)
            .Select(o => o.DriverId!.Value)
            .ToListAsync(ct);

        foreach (var dId in assignedDriverIds)
        {
            excludedDriverIds.Add(dId);
        }

        // Build candidate list: all Free drivers in this fleet.
        var driverRows = await db.Drivers
            .AsNoTracking()
            .Where(d => d.IsActive)
            .Select(d => new DriverCandidate(
                d.Id,
                d.CurrentVehicleId,
                d.Status,
                d.LastLat,
                d.LastLng,
                d.LastPositionAt))
            .ToListAsync(ct);

        // Select nearest eligible driver via the pure selector.
        var candidate = NearestDriverSelector.SelectNearest(
            driverRows,
            pickupLat, pickupLng,
            maxRadiusKm,
            now,
            StaleThreshold,
            excludedDriverIds);

        if (candidate is null)
        {
            logger.LogDebug(
                "No eligible driver for order {OrderId} {FleetId} {Reason}",
                orderId, fleetId, "NoEligibleDriver");
            return;
        }

        // Offer the order to the nearest driver.
        var orderService = scope.ServiceProvider.GetRequiredService<OrderService>();
        var result = await orderService.TransitionAsync(
            orderId,
            OrderTransition.Assign,
            Actor.System,
            payload: new AssignPayload(candidate.DriverId, candidate.CurrentVehicleId),
            ct);

        if (result.IsSuccess)
        {
            logger.LogInformation(
                "Order auto-dispatched {OrderId} {DriverId} {FleetId}",
                orderId, candidate.DriverId, fleetId);
        }
        else
        {
            // StaleVersion = concurrent manual assign or another tick won.
            // IllegalTransition = order is no longer New (already Assigned/Cancelled).
            // Both are benign — log at Debug and move on.
            logger.LogDebug(
                "Auto-dispatch skipped {OrderId} {FleetId} {Reason}",
                orderId, fleetId, result.FailureKind.ToString());
        }
    }
}

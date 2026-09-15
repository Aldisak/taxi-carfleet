using System.Collections.Concurrent;
using Microsoft.AspNetCore.SignalR;
using Taxi.Api.Infrastructure.Geo;
using Taxi.Api.Realtime;

namespace Taxi.Api.Common.Geo;

/// <summary>Service that computes and broadcasts driver→pickup ETA updates.
/// <para>
/// <b>Accept-time path</b>: called once from <c>AcceptOrderEndpoint.HandleAsync</c> after a
/// successful Accepted transition — makes a single <see cref="IGeoService.RouteAsync"/> call and
/// broadcasts the result to the <c>order:{orderId}</c> group.
/// </para>
/// <para>
/// <b>Position-triggered refresh path</b>: called from <see cref="FleetHub.UpdatePosition"/>
/// after every accepted driver position update. Refreshes at most once per 60 s <em>per order</em>
/// and only when at least one viewer is subscribed (tracked by <see cref="OrderSubscriptionTracker"/>).
/// Between refreshes the ETA is extrapolated from remaining haversine distance + last known speed —
/// no API call is made. When nobody is watching, 0 API calls are made.
/// </para>
/// <para>
/// <b>DI lifetime</b>: this service is a singleton (it holds the per-order <c>_lastRefresh</c>
/// dictionary that enforces the ≤60 s throttle). <see cref="IGeoService"/> is scoped. To avoid the
/// captive-dependency DI violation, the service resolves <see cref="IGeoService"/> from a
/// per-call scope via <see cref="IServiceScopeFactory"/> rather than accepting it in the constructor.
/// This mirrors the pattern used by background jobs (e.g. <c>OfferTimeoutJob</c>).
/// </para>
/// </summary>
internal sealed class PickupEtaService(
    IServiceScopeFactory scopeFactory,
    OrderSubscriptionTracker subscriptionTracker,
    IHubContext<FleetHub> hubContext,
    TimeProvider timeProvider,
    ILogger<PickupEtaService> logger)
{
    private static readonly TimeSpan RefreshThrottle = TimeSpan.FromSeconds(60);

    // Per-order last refresh timestamp.
    private readonly ConcurrentDictionary<Guid, DateTimeOffset> _lastRefresh = new();

    /// <summary>Computes the initial driver→pickup ETA immediately after the driver accepts an order.
    /// Makes exactly one <see cref="IGeoService.RouteAsync"/> call and broadcasts
    /// <c>PickupEtaUpdated</c> to <c>order:{orderId}</c>. On geo unavailability, extrapolates from
    /// haversine and broadcasts the estimate without throwing.</summary>
    /// <param name="orderId">The accepted order's ID.</param>
    /// <param name="fleetId">Fleet for usage accounting.</param>
    /// <param name="driverLat">Driver latitude at the moment of acceptance.</param>
    /// <param name="driverLng">Driver longitude at the moment of acceptance.</param>
    /// <param name="pickupLat">Pickup latitude.</param>
    /// <param name="pickupLng">Pickup longitude.</param>
    /// <param name="ct">Cancellation token.</param>
    public async Task BroadcastAcceptEtaAsync(
        Guid orderId,
        Guid fleetId,
        double driverLat,
        double driverLng,
        double pickupLat,
        double pickupLng,
        CancellationToken ct)
    {
        var (distanceM, durationS, isEstimate) =
            await ComputeRouteAsync(fleetId, driverLat, driverLng, pickupLat, pickupLng, ct);

        _lastRefresh[orderId] = timeProvider.GetUtcNow();

        await BroadcastEtaAsync(orderId, distanceM, durationS, isEstimate, ct);

        logger.LogDebug(
            "Pickup ETA accepted {OrderId} {DistanceM} {DurationS} {IsEstimate}",
            orderId, distanceM, durationS, isEstimate);
    }

    /// <summary>Called from <see cref="FleetHub.UpdatePosition"/> after an accepted position update.
    /// If at least one viewer is watching <c>order:{orderId}</c> AND the 60 s throttle window has elapsed,
    /// makes a single <see cref="IGeoService.RouteAsync"/> call and broadcasts the result.
    /// If nobody is watching, or the throttle window has not elapsed, extrapolates from haversine +
    /// last known speed and broadcasts without making an API call.</summary>
    /// <param name="orderId">The active order the driver is en route to.</param>
    /// <param name="fleetId">Fleet for usage accounting.</param>
    /// <param name="driverLat">Current driver latitude.</param>
    /// <param name="driverLng">Current driver longitude.</param>
    /// <param name="pickupLat">Pickup latitude.</param>
    /// <param name="pickupLng">Pickup longitude.</param>
    /// <param name="speedKmh">Last reported driver speed in km/h. Null if unknown (falls back to 35 km/h).</param>
    /// <param name="ct">Cancellation token.</param>
    public async Task RefreshEtaAsync(
        Guid orderId,
        Guid fleetId,
        double driverLat,
        double driverLng,
        double pickupLat,
        double pickupLng,
        double? speedKmh,
        CancellationToken ct)
    {
        var now = timeProvider.GetUtcNow();
        var hasViewers = subscriptionTracker.HasViewers(orderId);

        // Compute remaining haversine distance for extrapolation or throttle-check.
        var haversine = HaversineDistance.Meters(driverLat, driverLng, pickupLat, pickupLng);

        if (!hasViewers)
        {
            // Nobody watching: skip API call, extrapolate, broadcast.
            var (extraDistM, extraDurS) = Extrapolate(haversine, speedKmh);
            await BroadcastEtaAsync(orderId, extraDistM, extraDurS, isEstimate: true, ct);
            return;
        }

        // Check if the refresh throttle window has elapsed.
        var lastRefresh = _lastRefresh.GetValueOrDefault(orderId, DateTimeOffset.MinValue);
        if (now - lastRefresh < RefreshThrottle)
        {
            // Within throttle window: extrapolate only.
            var (extraDistM, extraDurS) = Extrapolate(haversine, speedKmh);
            await BroadcastEtaAsync(orderId, extraDistM, extraDurS, isEstimate: true, ct);
            return;
        }

        // Viewers present + throttle elapsed: make a real route call.
        var (distanceM, durationS, isEst) =
            await ComputeRouteAsync(fleetId, driverLat, driverLng, pickupLat, pickupLng, ct);

        _lastRefresh[orderId] = now;

        await BroadcastEtaAsync(orderId, distanceM, durationS, isEst, ct);

        logger.LogDebug(
            "Pickup ETA refreshed {OrderId} {DistanceM} {DurationS} {IsEstimate}",
            orderId, distanceM, durationS, isEst);
    }

    /// <summary>Removes the per-order refresh timestamp when an order leaves the en-route state
    /// (completed, cancelled, arrived). Prevents stale entries from accumulating.</summary>
    /// <param name="orderId">The order that is no longer en route to pickup.</param>
    public void ClearOrder(Guid orderId) => _lastRefresh.TryRemove(orderId, out _);

    // ── Private helpers ───────────────────────────────────────────────────────

    /// <summary>Opens a per-call DI scope, resolves <see cref="IGeoService"/>, calls
    /// <see cref="IGeoService.RouteAsync"/>, and returns (distanceM, durationS, isEstimate).
    /// On geo unavailability, falls back to haversine×1.3 estimate.
    /// <para>
    /// The scope is necessary because <see cref="IGeoService"/> is scoped while
    /// <see cref="PickupEtaService"/> is a singleton. This pattern mirrors <c>OfferTimeoutJob</c>.
    /// </para></summary>
    private async Task<(int DistanceM, int DurationS, bool IsEstimate)> ComputeRouteAsync(
        Guid fleetId,
        double fromLat, double fromLng,
        double toLat, double toLng,
        CancellationToken ct)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var geoService = scope.ServiceProvider.GetRequiredService<IGeoService>();

        var result = await geoService.RouteAsync(fleetId, fromLat, fromLng, toLat, toLng, ct);

        if (result.Result is GeoResult<MapyRouteResultData>.Success s)
        {
            return (s.Value.DistanceMeters, s.Value.DurationSeconds, result.IsEstimate);
        }

        // Geo unavailable: fall back to haversine estimate.
        var haversine = HaversineDistance.Meters(fromLat, fromLng, toLat, toLng);
        var roadM = (int)Math.Round(GeoEstimateFallback.RoadDistanceMeters(haversine));
        var durS = (int)Math.Round(GeoEstimateFallback.DurationSeconds(roadM));
        return (roadM, durS, true);
    }

    /// <summary>Extrapolates remaining ETA from haversine distance + reported driver speed.</summary>
    private static (int DistanceM, int DurationS) Extrapolate(double haversineMeters, double? speedKmh)
    {
        var speedMps = (speedKmh ?? 35.0) / 3.6; // km/h → m/s; fall back to 35 km/h
        if (speedMps <= 0) speedMps = 35.0 / 3.6;
        var durS = (int)Math.Round(haversineMeters / speedMps);
        return ((int)Math.Round(haversineMeters), durS);
    }

    /// <summary>Broadcasts <c>PickupEtaUpdated</c> to the <c>order:{orderId}</c> SignalR group.</summary>
    private async Task BroadcastEtaAsync(Guid orderId, int distanceM, int durationS, bool isEstimate, CancellationToken ct)
    {
        var payload = new { orderId, distanceM, durationS, isEstimate };
        await hubContext.Clients
            .Group($"order:{orderId}")
            .SendAsync("PickupEtaUpdated", payload, ct);
    }
}

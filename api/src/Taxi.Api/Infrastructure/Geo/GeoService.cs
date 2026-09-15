using Taxi.Api.Common.Geo;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Infrastructure.Geo;

/// <summary>Orchestrates GeoCache and IMapyClient for all geo operations.
/// <list type="bullet">
///   <item>Cache hit → return cached result immediately (no client call, no usage increment).</item>
///   <item>Cache miss → call IMapyClient → Success: write cache + record usage (inside GeoCache); Unavailable: no cache, no usage.</item>
///   <item>RouteAsync Unavailable → return degraded haversine×1.3 estimate flagged with IsEstimate=true.</item>
///   <item>QuickPlace → cache-only lookup, never calls client, never records usage.</item>
/// </list>
/// CRITICAL: GeoCache.GetOrAddAsync is the single usage-accounting site. Do NOT inject or call GeoUsageRecorder here.</summary>
internal sealed class GeoService(IMapyClient mapyClient, GeoCache geoCache) : IGeoService
{
    /// <inheritdoc />
    public async Task<GeoCacheResult<IReadOnlyList<MapySuggestResult>>> SuggestAsync(
        Guid fleetId, string q, (double Lat, double Lng)? near, CancellationToken ct)
    {
        // Fleetless callers (customers with no fleet_id claim) pass Guid.Empty.
        // geo_cache and geo_usage both have FK constraints to the fleets table; inserting a
        // row with FleetId=Guid.Empty would throw an EF/DB error.
        // For suggest specifically, there is no per-fleet sensitivity, so we bypass the cache
        // entirely and call the client directly — no cache write, no usage recording.
        if (fleetId == Guid.Empty)
        {
            var directResult = await mapyClient.SuggestAsync(q, ct);
            return new GeoCacheResult<IReadOnlyList<MapySuggestResult>>(directResult, WasHit: false);
        }

        var key = GeoCacheKey.Suggest(q, near);
        return await geoCache.GetOrAddAsync(
            fleetId,
            GeoCacheKind.Suggest,
            key,
            async c => await mapyClient.SuggestAsync(q, c),
            ct);
    }

    /// <inheritdoc />
    public async Task<GeoCacheResult<MapyGeocodeResult>> GeocodeAsync(
        Guid fleetId, string q, CancellationToken ct)
    {
        var key = GeoCacheKey.Geocode(q);
        return await geoCache.GetOrAddAsync(
            fleetId,
            GeoCacheKind.Geocode,
            key,
            async c => await mapyClient.GeocodeAsync(q, c),
            ct);
    }

    /// <inheritdoc />
    public async Task<GeoCacheResult<MapyRgeocodeResult>> ReverseAsync(
        Guid fleetId, double lat, double lng, CancellationToken ct)
    {
        var key = GeoCacheKey.Reverse(lat, lng);
        return await geoCache.GetOrAddAsync(
            fleetId,
            GeoCacheKind.Reverse,
            key,
            async c => await mapyClient.ReverseGeocodeAsync(lat, lng, c),
            ct);
    }

    /// <inheritdoc />
    public async Task<GeoRouteServiceResult> RouteAsync(
        Guid fleetId, double fromLat, double fromLng, double toLat, double toLng, CancellationToken ct)
    {
        var key = GeoCacheKey.Route(fromLat, fromLng, toLat, toLng);
        var cacheResult = await geoCache.GetOrAddAsync(
            fleetId,
            GeoCacheKind.Route,
            key,
            async c => await mapyClient.RouteAsync(fromLat, fromLng, toLat, toLng, c),
            ct);

        if (cacheResult.Result is GeoResult<MapyRouteResultData>.Unavailable)
        {
            // Degrade to haversine×1.3 estimate — never 502 from GeoService.
            // Callers (RouteEndpoint → 502, QuoteEndpoint → orientační odhad) decide the surface.
            var haversine = HaversineDistance.Meters(fromLat, fromLng, toLat, toLng);
            var roadMeters = (int)Math.Round(GeoEstimateFallback.RoadDistanceMeters(haversine));
            var durationSecs = (int)Math.Round(GeoEstimateFallback.DurationSeconds(roadMeters));
            var degraded = new MapyRouteResultData(roadMeters, durationSecs, []);
            return new GeoRouteServiceResult(
                new GeoResult<MapyRouteResultData>.Success(degraded),
                WasHit: false,
                IsEstimate: true);
        }

        return new GeoRouteServiceResult(cacheResult.Result, cacheResult.WasHit, IsEstimate: false);
    }

    /// <inheritdoc />
    public async Task<GeoCacheResult<IReadOnlyList<MapySuggestResult>>> QuickPlaceAsync(
        Guid fleetId, string placeKey, CancellationToken ct)
    {
        // QuickPlace: cache-only lookup — the factory returns Unavailable immediately
        // without calling IMapyClient, so GeoCache never records usage (Unavailable → no usage).
        return await geoCache.GetOrAddAsync(
            fleetId,
            GeoCacheKind.QuickPlace,
            placeKey,
            _ => Task.FromResult<GeoResult<IReadOnlyList<MapySuggestResult>>>(
                new GeoResult<IReadOnlyList<MapySuggestResult>>.Unavailable(GeoUnavailableReason.Timeout)),
            ct);
    }
}

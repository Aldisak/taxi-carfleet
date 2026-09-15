namespace Taxi.Api.Infrastructure.Geo;

/// <summary>High-level geo service that orchestrates GeoCache + IMapyClient for each operation.
/// On a cache miss, calls IMapyClient; on Unavailable for Route, returns a degraded haversine×1.3 estimate.
/// Usage accounting (geo_usage) is performed INSIDE GeoCache.GetOrAddAsync — never here; callers must NOT
/// call GeoUsageRecorder directly.</summary>
public interface IGeoService
{
    /// <summary>Address autocomplete. On cache hit, returns cached items without calling IMapyClient.
    /// On Unavailable, returns empty-list Success (never 5xx — order form is never blocked).</summary>
    /// <param name="fleetId">Fleet scoping the cache entry and usage.</param>
    /// <param name="q">User-entered query string (min 3 chars enforced by validator).</param>
    /// <param name="near">Optional near-coordinate hint (lat, lng) for location-biased results.</param>
    /// <param name="ct">Cancellation token.</param>
    Task<GeoCacheResult<IReadOnlyList<MapySuggestResult>>> SuggestAsync(
        Guid fleetId, string q, (double Lat, double Lng)? near, CancellationToken ct);

    /// <summary>Forward geocode (text → coordinates). On Unavailable, returns Unavailable result.</summary>
    /// <param name="fleetId">Fleet scoping the cache entry and usage.</param>
    /// <param name="q">Address or place text to geocode.</param>
    /// <param name="ct">Cancellation token.</param>
    Task<GeoCacheResult<MapyGeocodeResult>> GeocodeAsync(Guid fleetId, string q, CancellationToken ct);

    /// <summary>Reverse geocode (coordinates → address). On Unavailable, returns Unavailable result.</summary>
    /// <param name="fleetId">Fleet scoping the cache entry and usage.</param>
    /// <param name="lat">Latitude in decimal degrees.</param>
    /// <param name="lng">Longitude in decimal degrees.</param>
    /// <param name="ct">Cancellation token.</param>
    Task<GeoCacheResult<MapyRgeocodeResult>> ReverseAsync(
        Guid fleetId, double lat, double lng, CancellationToken ct);

    /// <summary>Point-to-point route. On cache hit, returns cached data without calling IMapyClient.
    /// On Unavailable, returns a degraded estimate: haversine×1.3 distance + ETA at 35 km/h,
    /// with <see cref="GeoRouteServiceResult.IsEstimate"/> = true. Never 502 — callers decide
    /// how to surface the degradation (WI-09 proxy → 502; WI-10 pricing → orientační odhad).</summary>
    /// <param name="fleetId">Fleet scoping the cache entry and usage.</param>
    /// <param name="fromLat">Origin latitude.</param>
    /// <param name="fromLng">Origin longitude.</param>
    /// <param name="toLat">Destination latitude.</param>
    /// <param name="toLng">Destination longitude.</param>
    /// <param name="ct">Cancellation token.</param>
    Task<GeoRouteServiceResult> RouteAsync(
        Guid fleetId, double fromLat, double fromLng, double toLat, double toLng, CancellationToken ct);

    /// <summary>Cache-only lookup for a well-known named place (e.g. "airport", "train station").
    /// Never calls IMapyClient; never records usage. Returns Unavailable when not in cache.</summary>
    /// <param name="fleetId">Fleet scoping the cache entry.</param>
    /// <param name="placeKey">Normalised place key (e.g. "airport").</param>
    /// <param name="ct">Cancellation token.</param>
    Task<GeoCacheResult<IReadOnlyList<MapySuggestResult>>> QuickPlaceAsync(
        Guid fleetId, string placeKey, CancellationToken ct);
}

namespace Taxi.Api.Infrastructure.Geo;

/// <summary>Typed HTTP client for the Mapy.com REST API.
/// All methods return a <see cref="GeoResult{T}"/> discriminated union — never throw for degradation,
/// never return null. Infrastructure failures (timeout, 5xx after retries, circuit-open) are mapped
/// to <see cref="GeoResult{T}.Unavailable"/> internally.</summary>
public interface IMapyClient
{
    /// <summary>Calls <c>GET /v1/suggest</c> with address/POI type filter and Czech language.</summary>
    /// <param name="query">User-entered search text.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>Parsed suggest items, or Unavailable on infrastructure failure.</returns>
    Task<GeoResult<IReadOnlyList<MapySuggestResult>>> SuggestAsync(string query, CancellationToken ct);

    /// <summary>Calls <c>GET /v1/geocode</c> to forward-geocode a text query.</summary>
    /// <param name="query">Address or place text to geocode.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>Geocode result (may be Found=false for no match), or Unavailable on infrastructure failure.</returns>
    Task<GeoResult<MapyGeocodeResult>> GeocodeAsync(string query, CancellationToken ct);

    /// <summary>Calls <c>GET /v1/rgeocode</c> to reverse-geocode coordinates to an address.</summary>
    /// <param name="lat">Latitude.</param>
    /// <param name="lng">Longitude.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>Reverse-geocode result, or Unavailable on infrastructure failure.</returns>
    Task<GeoResult<MapyRgeocodeResult>> ReverseGeocodeAsync(double lat, double lng, CancellationToken ct);

    /// <summary>Calls <c>GET /v1/routing/route</c> with car_fast profile and Czech language.
    /// The geometry is simplified to at most 200 points client-side.</summary>
    /// <param name="fromLat">Origin latitude.</param>
    /// <param name="fromLng">Origin longitude.</param>
    /// <param name="toLat">Destination latitude.</param>
    /// <param name="toLng">Destination longitude.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>Route result with distance, duration, and geometry, or Unavailable on infrastructure failure.</returns>
    Task<GeoResult<MapyRouteResultData>> RouteAsync(
        double fromLat, double fromLng, double toLat, double toLng, CancellationToken ct);
}

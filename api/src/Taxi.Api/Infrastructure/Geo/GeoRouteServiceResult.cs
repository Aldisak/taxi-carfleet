namespace Taxi.Api.Infrastructure.Geo;

/// <summary>Return value from <see cref="IGeoService.RouteAsync"/>.
/// Extends <see cref="GeoCacheResult{T}"/> with an <see cref="IsEstimate"/> flag that is set
/// when the route upstream was unavailable and the result is a degraded haversine×1.3 estimate.</summary>
/// <param name="Result">The geo-provider result (Success carrying route data or Unavailable).</param>
/// <param name="WasHit">True when the value was served from cache; false on a genuine upstream call or estimate.</param>
/// <param name="IsEstimate">True when the route is a haversine-based degraded estimate (Mapy unavailable).</param>
public record GeoRouteServiceResult(
    GeoResult<MapyRouteResultData> Result,
    bool WasHit,
    bool IsEstimate);

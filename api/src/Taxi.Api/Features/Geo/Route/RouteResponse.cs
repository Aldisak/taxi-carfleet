namespace Taxi.Api.Features.Geo.Route;

/// <summary>Response for POST /geo/route — distance, duration, optional estimated price, and route geometry.</summary>
/// <param name="DistanceMeters">Total route length in metres.</param>
/// <param name="DurationSeconds">Estimated travel time in seconds.</param>
/// <param name="EstimatedPriceCzk">Server-priced estimate in CZK, or <see langword="null"/> when no tariff is configured.</param>
/// <param name="Geometry">Simplified route geometry as lat/lng pairs (max 200 points), or <see langword="null"/> when unavailable.</param>
public record RouteResponse(
    int DistanceMeters,
    int DurationSeconds,
    int? EstimatedPriceCzk,
    IReadOnlyList<double[]>? Geometry);

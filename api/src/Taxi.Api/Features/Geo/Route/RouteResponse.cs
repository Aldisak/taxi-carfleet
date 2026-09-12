namespace Taxi.Api.Features.Geo.Route;

/// <summary>Response for GET /geo/route — distance, duration, and server-priced estimate.</summary>
public record RouteResponse(int DistanceMeters, int DurationSeconds, int? EstimatedPriceCzk);

namespace Taxi.Api.Infrastructure.Geo;

/// <summary>Route distance and duration result from the routing upstream.</summary>
public record GeoRouteResult(int DistanceMeters, int DurationSeconds);

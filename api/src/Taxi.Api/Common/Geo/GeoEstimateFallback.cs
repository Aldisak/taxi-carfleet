namespace Taxi.Api.Common.Geo;

/// <summary>Pure degraded-estimate helpers used when the Mapy.com route API is unavailable.
/// Applies a road-factor multiplier to a haversine distance and derives an ETA at 35 km/h.
/// The ±20 % band signals the wider uncertainty of the road-factor estimate (spec §6, AC#5).
/// No I/O, no DI — a pure static helper (architecture.md#common-infrastructure).</summary>
public static class GeoEstimateFallback
{
    /// <summary>Road-distance multiplier applied on top of the straight-line (haversine) distance.</summary>
    private const double RoadFactor = 1.3;

    /// <summary>Assumed average road speed used for ETA estimation, in metres per second.</summary>
    private const double SpeedMetersPerSecond = 35_000.0 / 3600.0; // 35 km/h

    /// <summary>Returns the estimated road distance in metres by multiplying the haversine
    /// straight-line distance by the <see cref="RoadFactor"/> (1.3).</summary>
    /// <param name="haversineMeters">Great-circle distance in metres as returned by
    /// <see cref="HaversineDistance.Meters"/>.</param>
    public static double RoadDistanceMeters(double haversineMeters) =>
        haversineMeters * RoadFactor;

    /// <summary>Returns the estimated travel duration in seconds for the given road distance,
    /// assuming an average speed of 35 km/h.</summary>
    /// <param name="roadMeters">Road distance in metres (use <see cref="RoadDistanceMeters"/>).</param>
    public static double DurationSeconds(double roadMeters) =>
        roadMeters / SpeedMetersPerSecond;

    /// <summary>Returns the wider ±20 % confidence band around an estimate value.
    /// Used to communicate the increased uncertainty of a degraded (haversine-based) estimate.
    /// Both bounds are inclusive.</summary>
    /// <param name="value">The central estimate value (distance in metres, price in CZK, etc.).</param>
    /// <returns>A tuple of (lower bound at −20 %, upper bound at +20 %).</returns>
    public static (double Lower, double Upper) WideBand(double value) =>
        (value * 0.8, value * 1.2);
}

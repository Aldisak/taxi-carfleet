namespace Taxi.Api.Common.Geo;

/// <summary>Pure great-circle distance calculation using the haversine formula.
/// Returns the shortest over-the-Earth distance between two lat/lng points.
/// No I/O, no DI — a pure static helper (architecture.md#common-infrastructure).</summary>
public static class HaversineDistance
{
    /// <summary>Mean radius of the Earth in metres (WGS-84 mean sphere approximation).</summary>
    private const double EarthRadiusMeters = 6_371_000.0;

    /// <summary>Returns the great-circle distance in metres between two points
    /// specified in decimal degrees (WGS-84 lat/lng).</summary>
    /// <param name="lat1">Latitude of the first point in decimal degrees.</param>
    /// <param name="lng1">Longitude of the first point in decimal degrees.</param>
    /// <param name="lat2">Latitude of the second point in decimal degrees.</param>
    /// <param name="lng2">Longitude of the second point in decimal degrees.</param>
    public static double Meters(double lat1, double lng1, double lat2, double lng2)
    {
        var dLat = ToRadians(lat2 - lat1);
        var dLng = ToRadians(lng2 - lng1);
        var a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2)
                + Math.Cos(ToRadians(lat1)) * Math.Cos(ToRadians(lat2))
                * Math.Sin(dLng / 2) * Math.Sin(dLng / 2);
        return EarthRadiusMeters * 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));
    }

    /// <summary>Converts degrees to radians.</summary>
    /// <param name="degrees">Angle in degrees.</param>
    private static double ToRadians(double degrees) => degrees * Math.PI / 180.0;
}

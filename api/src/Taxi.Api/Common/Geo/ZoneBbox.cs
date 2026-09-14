using System.Text.Json;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Common.Geo;

/// <summary>Axis-aligned bounding-box helpers for <see cref="Zone"/> geometries.
/// Circle: center ± radius-in-degrees (lng scaled by cos(lat) in radians).
/// Polygon: vertex min/max parsed from the jsonb array.
/// Reused by <c>GetDemandEndpoint</c> and <c>GetRevenueEndpoint</c>
/// (architecture.md#common-infrastructure — shared by 2+ features).</summary>
public static class ZoneBbox
{
    /// <summary>Computes the axis-aligned bounding box for the given zone.
    /// Returns (minLat, maxLat, minLng, maxLng). Returns an invalid box (minLat &gt; maxLat)
    /// when the zone is malformed (null radius for a circle, empty polygon).</summary>
    /// <param name="zone">The zone to compute the bounding box for.</param>
    public static (double MinLat, double MaxLat, double MinLng, double MaxLng) Compute(Zone zone)
    {
        if (zone.Shape == ZoneShape.Circle)
        {
            if (zone.RadiusMeters is not double r || r <= 0)
                return (1, 0, 1, 0); // invalid — minLat > maxLat signals skip

            var latDelta = r / 111_320.0;
            // Longitude delta must use radians for Math.Cos — degrees would be ~57× wider near Prague.
            var lngDelta = r / (111_320.0 * Math.Cos(zone.CenterLat * Math.PI / 180.0));

            return (zone.CenterLat - latDelta, zone.CenterLat + latDelta,
                    zone.CenterLng - lngDelta, zone.CenterLng + lngDelta);
        }

        if (zone.Shape == ZoneShape.Polygon && zone.Polygon is not null)
        {
            var vertices = ParsePolygon(zone.Polygon);
            if (vertices.Count == 0) return (1, 0, 1, 0); // invalid

            var minLat = vertices.Min(v => v.Lat);
            var maxLat = vertices.Max(v => v.Lat);
            var minLng = vertices.Min(v => v.Lng);
            var maxLng = vertices.Max(v => v.Lng);
            return (minLat, maxLat, minLng, maxLng);
        }

        return (1, 0, 1, 0); // unknown shape → skip
    }

    /// <summary>Parses a <c>[[lat,lng],...]</c> jsonb array into a list of lat/lng pairs.</summary>
    /// <param name="polygon">The jsonb polygon document.</param>
    private static List<(double Lat, double Lng)> ParsePolygon(JsonDocument polygon)
    {
        var result = new List<(double, double)>();
        if (polygon.RootElement.ValueKind != JsonValueKind.Array) return result;
        foreach (var pair in polygon.RootElement.EnumerateArray())
        {
            if (pair.ValueKind != JsonValueKind.Array || pair.GetArrayLength() < 2) continue;
            result.Add((pair[0].GetDouble(), pair[1].GetDouble()));
        }
        return result;
    }
}

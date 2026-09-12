using System.Text.Json;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Common.Geo;

/// <summary>Pure, stateless point-in-zone geometry. No DbContext, no IO — shared by the pricing
/// matcher and any zone-restricted input check. A <see cref="ZoneShape.Circle"/> uses the haversine
/// great-circle distance (inside when distance &lt;= radius); a <see cref="ZoneShape.Polygon"/> uses
/// ray-casting over the <c>[[lat,lng],...]</c> array parsed from the jsonb <see cref="Zone.Polygon"/>
/// document IN MEMORY (never inside a LINQ-to-SQL projection — CLAUDE.md WI-10).
/// <para>Boundary convention: a point exactly on the radius or on a polygon edge is treated as INSIDE.</para></summary>
public static class ZoneService
{
    private const double EarthRadiusMeters = 6_371_000;

    /// <summary>Returns true when the given point lies inside (or on the boundary of) the zone.
    /// A malformed zone (null radius for a circle, null/empty polygon) returns false (guard, not throw).</summary>
    /// <param name="zone">The zone to test against.</param>
    /// <param name="lat">Point latitude.</param>
    /// <param name="lng">Point longitude.</param>
    public static bool Contains(Zone zone, double lat, double lng) => zone.Shape switch
    {
        ZoneShape.Circle => ContainsCircle(zone, lat, lng),
        ZoneShape.Polygon => ContainsPolygon(zone, lat, lng),
        _ => false
    };

    /// <summary>Great-circle distance in meters between two WGS84 points (haversine).</summary>
    /// <param name="lat1">First point latitude.</param>
    /// <param name="lng1">First point longitude.</param>
    /// <param name="lat2">Second point latitude.</param>
    /// <param name="lng2">Second point longitude.</param>
    public static double DistanceMeters(double lat1, double lng1, double lat2, double lng2)
    {
        var dLat = ToRadians(lat2 - lat1);
        var dLng = ToRadians(lng2 - lng1);
        var a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2)
                + Math.Cos(ToRadians(lat1)) * Math.Cos(ToRadians(lat2))
                * Math.Sin(dLng / 2) * Math.Sin(dLng / 2);
        return EarthRadiusMeters * 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));
    }

    private static bool ContainsCircle(Zone zone, double lat, double lng)
    {
        if (zone.RadiusMeters is not double radius || radius <= 0) return false;
        return DistanceMeters(zone.CenterLat, zone.CenterLng, lat, lng) <= radius;
    }

    private static bool ContainsPolygon(Zone zone, double lat, double lng)
    {
        if (zone.Polygon is null) return false;

        var vertices = ParsePolygon(zone.Polygon);
        if (vertices.Count < 3) return false;

        // On-edge → inside (documented boundary convention).
        for (var i = 0; i < vertices.Count; i++)
        {
            var a = vertices[i];
            var b = vertices[(i + 1) % vertices.Count];
            if (IsOnSegment(lat, lng, a.lat, a.lng, b.lat, b.lng)) return true;
        }

        // Ray-casting: count crossings of a ray going east (increasing lng) from the point.
        var inside = false;
        for (int i = 0, j = vertices.Count - 1; i < vertices.Count; j = i++)
        {
            var (latI, lngI) = vertices[i];
            var (latJ, lngJ) = vertices[j];

            var intersects = latI > lat != latJ > lat
                && lng < (lngJ - lngI) * (lat - latI) / (latJ - latI) + lngI;
            if (intersects) inside = !inside;
        }

        return inside;
    }

    private static List<(double lat, double lng)> ParsePolygon(JsonDocument polygon)
    {
        var result = new List<(double, double)>();
        if (polygon.RootElement.ValueKind != JsonValueKind.Array) return result;

        foreach (var pair in polygon.RootElement.EnumerateArray())
        {
            if (pair.ValueKind != JsonValueKind.Array || pair.GetArrayLength() < 2) continue;
            var latEl = pair[0];
            var lngEl = pair[1];
            result.Add((latEl.GetDouble(), lngEl.GetDouble()));
        }

        return result;
    }

    /// <summary>Whether point (pLat, pLng) lies on the segment from (aLat, aLng) to (bLat, bLng),
    /// within a small epsilon (treats lat/lng as a planar approximation — adequate at city scale).</summary>
    private static bool IsOnSegment(
        double pLat, double pLng, double aLat, double aLng, double bLat, double bLng)
    {
        const double epsilon = 1e-9;
        // Cross product ~ 0 → colinear.
        var cross = (pLat - aLat) * (bLng - aLng) - (pLng - aLng) * (bLat - aLat);
        if (Math.Abs(cross) > epsilon) return false;

        // Within the bounding box of the segment.
        return Math.Min(aLat, bLat) - epsilon <= pLat && pLat <= Math.Max(aLat, bLat) + epsilon
            && Math.Min(aLng, bLng) - epsilon <= pLng && pLng <= Math.Max(aLng, bLng) + epsilon;
    }

    private static double ToRadians(double degrees) => degrees * Math.PI / 180;
}

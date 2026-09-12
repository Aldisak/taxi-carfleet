using System.Text.Json;
using FluentAssertions;
using Taxi.Api.Common.Geo;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Tests.Geo;

/// <summary>Unit tests for the pure <see cref="ZoneService"/> point-in-zone primitive.
/// Coordinates are Kutná Hora / Kolín (Czech) only. The boundary convention (a point exactly
/// on a circle radius / polygon edge is treated as INSIDE) is asserted and documented here.</summary>
public sealed class ZoneServiceTests
{
    // Kutná Hora town centre.
    private const double KhLat = 49.9481;
    private const double KhLng = 15.2681;

    private static Zone Circle(double centerLat, double centerLng, double radiusMeters) => new()
    {
        Id = Guid.CreateVersion7(),
        FleetId = Guid.CreateVersion7(),
        Name = "Circle",
        Shape = ZoneShape.Circle,
        CenterLat = centerLat,
        CenterLng = centerLng,
        RadiusMeters = radiusMeters,
        IsEnabled = true
    };

    private static Zone Polygon(params (double lat, double lng)[] pts)
    {
        var coords = pts.Select(p => new[] { p.lat, p.lng }).ToArray();
        return new Zone
        {
            Id = Guid.CreateVersion7(),
            FleetId = Guid.CreateVersion7(),
            Name = "Polygon",
            Shape = ZoneShape.Polygon,
            Polygon = JsonDocument.Parse(JsonSerializer.Serialize(coords)),
            IsEnabled = true
        };
    }

    /// <summary>The exact centre of a circle zone is inside.</summary>
    [Fact]
    public void ZoneService_CircleCenter_Contains()
    {
        var zone = Circle(KhLat, KhLng, 2000);
        ZoneService.Contains(zone, KhLat, KhLng).Should().BeTrue();
    }

    /// <summary>A point well beyond the radius is excluded.</summary>
    [Fact]
    public void ZoneService_CircleJustOutside_Excludes()
    {
        // 2 km radius centred on KH; Kolín (~10 km away) is clearly outside.
        var zone = Circle(KhLat, KhLng, 2000);
        ZoneService.Contains(zone, 50.0281, 15.2006).Should().BeFalse();
    }

    /// <summary>A point whose great-circle distance equals the radius is treated as INSIDE
    /// (boundary convention: distance &lt;= radius). Documented so callers can rely on it.</summary>
    [Fact]
    public void ZoneService_CircleOnBoundary_DocumentedConvention()
    {
        // Pick a point ~1 km due north of KH, then set the radius to that exact distance.
        const double northLat = KhLat + 0.009; // ~1 km north (1 deg lat ≈ 111.32 km)
        var distance = Haversine(KhLat, KhLng, northLat, KhLng);
        var zone = Circle(KhLat, KhLng, distance);

        // On the boundary → inside (<= radius convention).
        ZoneService.Contains(zone, northLat, KhLng).Should().BeTrue(
            "a point exactly on the radius is treated as inside (distance <= radius)");
    }

    /// <summary>A point inside a convex polygon around KH is contained.</summary>
    [Fact]
    public void ZoneService_PolygonInside_Contains()
    {
        var zone = Polygon(
            (49.94, 15.26),
            (49.94, 15.28),
            (49.96, 15.28),
            (49.96, 15.26));
        ZoneService.Contains(zone, 49.95, 15.27).Should().BeTrue();
    }

    /// <summary>A point outside the polygon is excluded.</summary>
    [Fact]
    public void ZoneService_PolygonOutside_Excludes()
    {
        var zone = Polygon(
            (49.94, 15.26),
            (49.94, 15.28),
            (49.96, 15.28),
            (49.96, 15.26));
        ZoneService.Contains(zone, 50.03, 15.20).Should().BeFalse();
    }

    /// <summary>A point lying exactly on a polygon edge is treated as INSIDE (documented convention).</summary>
    [Fact]
    public void ZoneService_PolygonOnEdge_DocumentedConvention()
    {
        var zone = Polygon(
            (49.94, 15.26),
            (49.94, 15.28),
            (49.96, 15.28),
            (49.96, 15.26));
        // Midpoint of the bottom edge (lat 49.94, lng between 15.26 and 15.28).
        ZoneService.Contains(zone, 49.94, 15.27).Should().BeTrue(
            "a point on a polygon edge is treated as inside (documented boundary convention)");
    }

    /// <summary>A circle zone with a null radius returns false (guard, not exception).</summary>
    [Fact]
    public void ZoneService_CircleNullRadius_ReturnsFalse()
    {
        var zone = new Zone
        {
            Id = Guid.CreateVersion7(),
            FleetId = Guid.CreateVersion7(),
            Name = "BadCircle",
            Shape = ZoneShape.Circle,
            CenterLat = KhLat,
            CenterLng = KhLng,
            RadiusMeters = null,
            IsEnabled = true
        };
        ZoneService.Contains(zone, KhLat, KhLng).Should().BeFalse();
    }

    /// <summary>A polygon zone with a null polygon returns false (guard, not exception).</summary>
    [Fact]
    public void ZoneService_PolygonNull_ReturnsFalse()
    {
        var zone = new Zone
        {
            Id = Guid.CreateVersion7(),
            FleetId = Guid.CreateVersion7(),
            Name = "BadPolygon",
            Shape = ZoneShape.Polygon,
            Polygon = null,
            IsEnabled = true
        };
        ZoneService.Contains(zone, KhLat, KhLng).Should().BeFalse();
    }

    // Local haversine mirror for the boundary test's radius computation.
    private static double Haversine(double lat1, double lng1, double lat2, double lng2)
    {
        const double r = 6_371_000;
        var dLat = (lat2 - lat1) * Math.PI / 180;
        var dLng = (lng2 - lng1) * Math.PI / 180;
        var a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2)
                + Math.Cos(lat1 * Math.PI / 180) * Math.Cos(lat2 * Math.PI / 180)
                * Math.Sin(dLng / 2) * Math.Sin(dLng / 2);
        return r * 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));
    }
}

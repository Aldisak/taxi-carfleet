using FluentAssertions;
using Taxi.Api.Common.Pricing;
using Taxi.Api.Infrastructure.Entities;
using RouteEntity = Taxi.Api.Infrastructure.Entities.Route;

namespace Taxi.Api.Tests.Pricing;

/// <summary>Unit tests for the pure <see cref="RouteMatcher"/> — precedence (PointToPoint → ZoneToZone
/// → Zone; within a type: highest Priority then lowest price), bidirectional ZoneToZone, midnight-wrap
/// validity windows (Europe/Prague), and the pickup-on-zone-edge convention.</summary>
public sealed class RouteMatcherTests
{
    private static readonly TimeZoneInfo Prague = TimeZoneInfo.FindSystemTimeZoneById("Europe/Prague");

    // Kutná Hora + Kolín.
    private const double KhLat = 49.9481;
    private const double KhLng = 15.2681;
    private const double KolinLat = 50.0281;
    private const double KolinLng = 15.2006;

    // A Thursday 14:00 Europe/Prague = 12:00 UTC (CEST, +2).
    private static readonly DateTimeOffset ThursdayNoon = new(2026, 9, 10, 12, 0, 0, TimeSpan.Zero);

    private static Zone CircleZone(string name, double lat, double lng, double radius) => new()
    {
        Id = Guid.CreateVersion7(),
        FleetId = Guid.CreateVersion7(),
        Name = name,
        Shape = ZoneShape.Circle,
        CenterLat = lat,
        CenterLng = lng,
        RadiusMeters = radius,
        IsEnabled = true
    };

    private static RouteEntity PointToPoint(string name, int price, int priority,
        double fromLat, double fromLng, double toLat, double toLng, double radius = 400) => new()
        {
            Id = Guid.CreateVersion7(),
            FleetId = Guid.CreateVersion7(),
            Name = name,
            Type = RouteType.PointToPoint,
            PriceCzk = price,
            FromLat = fromLat,
            FromLng = fromLng,
            ToLat = toLat,
            ToLng = toLng,
            FromRadiusMeters = radius,
            ToRadiusMeters = radius,
            ValidDays = 127,
            Priority = priority,
            IsEnabled = true
        };

    private static RouteEntity ZoneRoute(string name, int price, int priority, Guid fromZoneId,
        int validDays = 127, TimeOnly? from = null, TimeOnly? to = null) => new()
        {
            Id = Guid.CreateVersion7(),
            FleetId = Guid.CreateVersion7(),
            Name = name,
            Type = RouteType.Zone,
            PriceCzk = price,
            FromZoneId = fromZoneId,
            ValidDays = validDays,
            ValidFromTime = from,
            ValidToTime = to,
            Priority = priority,
            IsEnabled = true
        };

    private static RouteEntity ZoneToZone(string name, int price, int priority,
        Guid fromZoneId, Guid toZoneId, bool bidirectional) => new()
        {
            Id = Guid.CreateVersion7(),
            FleetId = Guid.CreateVersion7(),
            Name = name,
            Type = RouteType.ZoneToZone,
            PriceCzk = price,
            FromZoneId = fromZoneId,
            ToZoneId = toZoneId,
            IsBidirectional = bidirectional,
            ValidDays = 127,
            Priority = priority,
            IsEnabled = true
        };

    /// <summary>When a PointToPoint and a Zone route both match, PointToPoint wins (precedence).
    /// When two same-type routes match, higher Priority wins, then lower price.</summary>
    [Fact]
    public void RouteMatcher_OverlappingRoutes_PrecedenceAndPriorityWin()
    {
        var khZone = CircleZone("KH", KhLat, KhLng, 4000);
        var p2p = PointToPoint("P2P", 100, 1, KhLat, KhLng, KolinLat, KolinLng);
        var zone = ZoneRoute("Zone", 110, 99, khZone.Id); // higher priority but lower precedence type

        var match = RouteMatcher.Match(
            [zone, p2p], [khZone], KhLat, KhLng, KolinLat, KolinLng, ThursdayNoon, Prague);

        match.Should().NotBeNull();
        match!.Value.RouteName.Should().Be("P2P", "PointToPoint precedence beats Zone even with lower priority");

        // Same-type precedence: two zone routes, higher priority wins; tie → lower price.
        var zoneHi = ZoneRoute("ZoneHi", 200, 10, khZone.Id);
        var zoneLo = ZoneRoute("ZoneLo", 150, 5, khZone.Id);
        var zoneMatch = RouteMatcher.Match(
            [zoneLo, zoneHi], [khZone], KhLat, KhLng, null, null, ThursdayNoon, Prague);
        zoneMatch!.Value.RouteName.Should().Be("ZoneHi", "higher priority wins within the same type");

        var zoneCheap = ZoneRoute("Cheap", 80, 7, khZone.Id);
        var zonePricey = ZoneRoute("Pricey", 120, 7, khZone.Id);
        var tieMatch = RouteMatcher.Match(
            [zonePricey, zoneCheap], [khZone], KhLat, KhLng, null, null, ThursdayNoon, Prague);
        tieMatch!.Value.RouteName.Should().Be("Cheap", "equal priority → lower price wins");
    }

    /// <summary>A bidirectional ZoneToZone route matches both from→to and to→from.</summary>
    [Fact]
    public void RouteMatcher_ZoneToZone_BidirectionalMatchesBothDirections()
    {
        var khZone = CircleZone("KH", KhLat, KhLng, 4000);
        var kolinZone = CircleZone("Kolin", KolinLat, KolinLng, 4000);
        var z2z = ZoneToZone("KH<->Kolin", 300, 10, khZone.Id, kolinZone.Id, bidirectional: true);

        // KH → Kolin
        var forward = RouteMatcher.Match(
            [z2z], [khZone, kolinZone], KhLat, KhLng, KolinLat, KolinLng, ThursdayNoon, Prague);
        forward!.Value.PriceCzk.Should().Be(300);

        // Kolin → KH (reverse) — must also match because bidirectional.
        var reverse = RouteMatcher.Match(
            [z2z], [khZone, kolinZone], KolinLat, KolinLng, KhLat, KhLng, ThursdayNoon, Prague);
        reverse.Should().NotBeNull("a bidirectional ZoneToZone matches the reverse direction too");
        reverse!.Value.PriceCzk.Should().Be(300);

        // A NON-bidirectional route must NOT match the reverse direction.
        var oneWay = ZoneToZone("OneWay", 300, 10, khZone.Id, kolinZone.Id, bidirectional: false);
        var reverseOneWay = RouteMatcher.Match(
            [oneWay], [khZone, kolinZone], KolinLat, KolinLng, KhLat, KhLng, ThursdayNoon, Prague);
        reverseOneWay.Should().BeNull("a one-way ZoneToZone must not match the reverse direction");
    }

    /// <summary>A validity window that wraps midnight (22:00–06:00) includes 23:30 and 02:00 but not 12:00.</summary>
    [Fact]
    public void RouteMatcher_NightWindow_WrapsMidnight()
    {
        var khZone = CircleZone("KH", KhLat, KhLng, 4000);
        var night = ZoneRoute("Night", 500, 10, khZone.Id,
            from: new TimeOnly(22, 0), to: new TimeOnly(6, 0));

        // 23:30 Prague → inside the wrapped window. 2026-09-10 21:30 UTC = 23:30 CEST.
        var at2330 = new DateTimeOffset(2026, 9, 10, 21, 30, 0, TimeSpan.Zero);
        RouteMatcher.Match([night], [khZone], KhLat, KhLng, null, null, at2330, Prague)
            .Should().NotBeNull("23:30 is inside the 22:00-06:00 wrapped window");

        // 02:00 Prague → inside. 2026-09-11 00:00 UTC = 02:00 CEST.
        var at0200 = new DateTimeOffset(2026, 9, 11, 0, 0, 0, TimeSpan.Zero);
        RouteMatcher.Match([night], [khZone], KhLat, KhLng, null, null, at0200, Prague)
            .Should().NotBeNull("02:00 is inside the 22:00-06:00 wrapped window");

        // 12:00 Prague → outside. 2026-09-10 10:00 UTC = 12:00 CEST.
        var atNoon = new DateTimeOffset(2026, 9, 10, 10, 0, 0, TimeSpan.Zero);
        RouteMatcher.Match([night], [khZone], KhLat, KhLng, null, null, atNoon, Prague)
            .Should().BeNull("12:00 is outside the 22:00-06:00 wrapped window");
    }

    /// <summary>A pickup exactly on a zone's radius is treated as inside (ZoneService convention).</summary>
    [Fact]
    public void RouteMatcher_PickupOnZoneEdge_UsesZoneServiceConvention()
    {
        // Point ~1 km north of KH; set the circle radius to exactly that distance.
        const double northLat = KhLat + 0.009;
        var distance = Taxi.Api.Common.Geo.ZoneService.DistanceMeters(KhLat, KhLng, northLat, KhLng);
        var khZone = CircleZone("KH", KhLat, KhLng, distance);
        var zone = ZoneRoute("EdgeZone", 110, 10, khZone.Id);

        var match = RouteMatcher.Match(
            [zone], [khZone], northLat, KhLng, null, null, ThursdayNoon, Prague);
        match.Should().NotBeNull("a pickup exactly on the zone edge is inside (distance <= radius)");
    }
}

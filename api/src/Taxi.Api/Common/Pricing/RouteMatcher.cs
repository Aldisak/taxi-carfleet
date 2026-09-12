using Taxi.Api.Common.Geo;
using Taxi.Api.Infrastructure.Entities;
using RouteEntity = Taxi.Api.Infrastructure.Entities.Route;

namespace Taxi.Api.Common.Pricing;

/// <summary>Pure route-matching algorithm (no DbContext/IO). Given the fleet's candidate routes + zones
/// (loaded in memory), a pickup (and optional dropoff) and an evaluation time, returns the best matching
/// route or null.
/// <para>Precedence: PointToPoint → ZoneToZone → Zone. Within a type the winner has the highest Priority,
/// then the lowest price. A ZoneToZone route honours <see cref="RouteEntity.IsBidirectional"/> (matches
/// from→to OR to→from). Validity uses the ValidDays bitmask AND a time window that correctly wraps
/// midnight (e.g. 22:00–06:00 includes 23:30 and 02:00 but not 12:00), evaluated in the supplied
/// time zone (Europe/Prague).</para></summary>
public static class RouteMatcher
{
    /// <summary>Finds the best matching route, or null when none match.</summary>
    /// <param name="routes">Candidate routes (caller pre-filters to enabled + non-deleted).</param>
    /// <param name="zones">Candidate zones used for Zone/ZoneToZone containment.</param>
    /// <param name="pickupLat">Pickup latitude.</param>
    /// <param name="pickupLng">Pickup longitude.</param>
    /// <param name="dropoffLat">Dropoff latitude, or null when unknown.</param>
    /// <param name="dropoffLng">Dropoff longitude, or null when unknown.</param>
    /// <param name="at">Evaluation time (UTC-based DateTimeOffset).</param>
    /// <param name="timeZone">Fleet time zone for validity-window evaluation.</param>
    public static RouteMatchResult? Match(
        IReadOnlyList<RouteEntity> routes,
        IReadOnlyList<Zone> zones,
        double pickupLat,
        double pickupLng,
        double? dropoffLat,
        double? dropoffLng,
        DateTimeOffset at,
        TimeZoneInfo timeZone)
    {
        var local = TimeZoneInfo.ConvertTime(at, timeZone);
        var nowTime = TimeOnly.FromDateTime(local.DateTime);
        var dayBit = DayBit(local.DayOfWeek);

        var zonesById = zones.ToDictionary(z => z.Id);

        // Precedence order — first type with any match wins.
        RouteType[] precedence = [RouteType.PointToPoint, RouteType.ZoneToZone, RouteType.Zone];

        foreach (var type in precedence)
        {
            var matches = routes
                .Where(r => r.Type == type
                            && IsValidNow(r, dayBit, nowTime)
                            && Matches(r, zonesById, pickupLat, pickupLng, dropoffLat, dropoffLng))
                .OrderByDescending(r => r.Priority)
                .ThenBy(r => r.PriceCzk)
                .ToList();

            if (matches.Count > 0)
            {
                var best = matches[0];
                return new RouteMatchResult(best.Id, best.Name, best.PriceCzk);
            }
        }

        return null;
    }

    private static bool Matches(
        RouteEntity route,
        IReadOnlyDictionary<Guid, Zone> zonesById,
        double pickupLat, double pickupLng,
        double? dropoffLat, double? dropoffLng) => route.Type switch
        {
            RouteType.PointToPoint => MatchesPointToPoint(route, pickupLat, pickupLng, dropoffLat, dropoffLng),
            RouteType.Zone => MatchesZone(route, zonesById, pickupLat, pickupLng),
            RouteType.ZoneToZone => MatchesZoneToZone(route, zonesById, pickupLat, pickupLng, dropoffLat, dropoffLng),
            _ => false
        };

    private static bool MatchesPointToPoint(
        RouteEntity route, double pickupLat, double pickupLng, double? dropoffLat, double? dropoffLng)
    {
        // PointToPoint needs a dropoff; without one it cannot match.
        if (dropoffLat is not double dLat || dropoffLng is not double dLng) return false;
        if (route.ToLat is not double rToLat || route.ToLng is not double rToLng) return false;

        return ZoneService.DistanceMeters(route.FromLat, route.FromLng, pickupLat, pickupLng) <= route.FromRadiusMeters
            && ZoneService.DistanceMeters(rToLat, rToLng, dLat, dLng) <= route.ToRadiusMeters;
    }

    private static bool MatchesZone(
        RouteEntity route, IReadOnlyDictionary<Guid, Zone> zonesById, double pickupLat, double pickupLng)
    {
        // A Zone route matches on pickup-in-zone ALONE (no dropoff required).
        if (route.FromZoneId is not Guid fromZoneId || !zonesById.TryGetValue(fromZoneId, out var zone)) return false;
        return ZoneService.Contains(zone, pickupLat, pickupLng);
    }

    private static bool MatchesZoneToZone(
        RouteEntity route,
        IReadOnlyDictionary<Guid, Zone> zonesById,
        double pickupLat, double pickupLng,
        double? dropoffLat, double? dropoffLng)
    {
        // ZoneToZone needs both a pickup and a dropoff.
        if (dropoffLat is not double dLat || dropoffLng is not double dLng) return false;
        if (route.FromZoneId is not Guid fromZoneId || route.ToZoneId is not Guid toZoneId) return false;
        if (!zonesById.TryGetValue(fromZoneId, out var fromZone) || !zonesById.TryGetValue(toZoneId, out var toZone))
            return false;

        var forward = ZoneService.Contains(fromZone, pickupLat, pickupLng)
                      && ZoneService.Contains(toZone, dLat, dLng);
        if (forward) return true;

        if (!route.IsBidirectional) return false;

        return ZoneService.Contains(toZone, pickupLat, pickupLng)
               && ZoneService.Contains(fromZone, dLat, dLng);
    }

    private static bool IsValidNow(RouteEntity route, int dayBit, TimeOnly nowTime)
    {
        if ((route.ValidDays & dayBit) != dayBit) return false;
        return IsWithinWindow(route.ValidFromTime, route.ValidToTime, nowTime);
    }

    private static bool IsWithinWindow(TimeOnly? from, TimeOnly? to, TimeOnly now)
    {
        if (from is null || to is null) return true; // all-day

        var f = from.Value;
        var t = to.Value;

        // Non-wrapping window (e.g. 08:00–18:00).
        if (f <= t) return now >= f && now <= t;

        // Wrapping window (e.g. 22:00–06:00): inside if at/after start OR at/before end.
        return now >= f || now <= t;
    }

    private static int DayBit(DayOfWeek day) => day switch
    {
        DayOfWeek.Monday => 1,
        DayOfWeek.Tuesday => 2,
        DayOfWeek.Wednesday => 4,
        DayOfWeek.Thursday => 8,
        DayOfWeek.Friday => 16,
        DayOfWeek.Saturday => 32,
        DayOfWeek.Sunday => 64,
        _ => 0
    };
}

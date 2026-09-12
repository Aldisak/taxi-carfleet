using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Features.Routes;

/// <summary>Per-type field validation shared by the route create/update validators.</summary>
internal static class RouteTypeValidation
{
    /// <summary>Parses a route type string. Returns null when unrecognized.</summary>
    public static RouteType? ParseType(string type) =>
        Enum.TryParse<RouteType>(type, ignoreCase: true, out var parsed) ? parsed : null;

    /// <summary>PointToPoint requires from/to coordinates present and both radii positive.</summary>
    public static bool IsValidPointToPoint(double? toLat, double? toLng, double fromRadius, double toRadius) =>
        toLat is not null && toLng is not null && fromRadius > 0 && toRadius > 0;

    /// <summary>Zone requires a from-zone and no to-zone.</summary>
    public static bool IsValidZone(Guid? fromZoneId, Guid? toZoneId) =>
        fromZoneId is not null && toZoneId is null;

    /// <summary>ZoneToZone requires both a from-zone and a to-zone.</summary>
    public static bool IsValidZoneToZone(Guid? fromZoneId, Guid? toZoneId) =>
        fromZoneId is not null && toZoneId is not null;
}

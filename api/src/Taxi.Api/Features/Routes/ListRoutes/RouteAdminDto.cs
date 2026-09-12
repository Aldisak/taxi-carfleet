namespace Taxi.Api.Features.Routes.ListRoutes;

/// <summary>A route projected for the admin editor — carries all editable fields.</summary>
/// <param name="Id">Route primary key.</param>
/// <param name="Name">Display name.</param>
/// <param name="Type">Route type ("PointToPoint", "Zone", "ZoneToZone").</param>
/// <param name="PriceCzk">Fixed price in CZK.</param>
/// <param name="FromZoneId">Origin zone id (Zone / ZoneToZone).</param>
/// <param name="ToZoneId">Destination zone id (ZoneToZone).</param>
/// <param name="FromLat">Origin latitude (PointToPoint).</param>
/// <param name="FromLng">Origin longitude (PointToPoint).</param>
/// <param name="ToLat">Destination latitude (PointToPoint).</param>
/// <param name="ToLng">Destination longitude (PointToPoint).</param>
/// <param name="FromRadiusMeters">Origin match radius in meters (PointToPoint).</param>
/// <param name="ToRadiusMeters">Destination match radius in meters (PointToPoint).</param>
/// <param name="IsBidirectional">Whether ZoneToZone matches both directions.</param>
/// <param name="ValidDays">Bitmask of valid weekdays (1=Mon … 64=Sun).</param>
/// <param name="ValidFromTime">Start of the validity window (null = all-day).</param>
/// <param name="ValidToTime">End of the validity window (null = all-day).</param>
/// <param name="Priority">Match priority (higher wins).</param>
/// <param name="IsEnabled">Whether the route is enabled.</param>
public record RouteAdminDto(
    Guid Id,
    string Name,
    string Type,
    int PriceCzk,
    Guid? FromZoneId,
    Guid? ToZoneId,
    double FromLat,
    double FromLng,
    double? ToLat,
    double? ToLng,
    double FromRadiusMeters,
    double ToRadiusMeters,
    bool IsBidirectional,
    int ValidDays,
    TimeOnly? ValidFromTime,
    TimeOnly? ValidToTime,
    int Priority,
    bool IsEnabled);

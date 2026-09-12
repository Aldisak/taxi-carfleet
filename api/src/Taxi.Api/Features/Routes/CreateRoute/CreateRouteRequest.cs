namespace Taxi.Api.Features.Routes.CreateRoute;

/// <summary>Request body for POST /routes. Fields required depend on Type:
/// PointToPoint → From/To coords + radii; Zone → FromZoneId (To* null);
/// ZoneToZone → FromZoneId + ToZoneId.</summary>
public sealed class CreateRouteRequest
{
    /// <summary>Display name of the route.</summary>
    public string Name { get; init; } = string.Empty;

    /// <summary>Route type: "PointToPoint", "Zone", or "ZoneToZone".</summary>
    public string Type { get; init; } = string.Empty;

    /// <summary>Fixed price in CZK.</summary>
    public int PriceCzk { get; init; }

    /// <summary>Origin zone id (Zone / ZoneToZone).</summary>
    public Guid? FromZoneId { get; init; }

    /// <summary>Destination zone id (ZoneToZone).</summary>
    public Guid? ToZoneId { get; init; }

    /// <summary>Origin latitude (PointToPoint).</summary>
    public double FromLat { get; init; }

    /// <summary>Origin longitude (PointToPoint).</summary>
    public double FromLng { get; init; }

    /// <summary>Destination latitude (PointToPoint).</summary>
    public double? ToLat { get; init; }

    /// <summary>Destination longitude (PointToPoint).</summary>
    public double? ToLng { get; init; }

    /// <summary>Origin match radius in meters (PointToPoint). Defaults to 150.</summary>
    public double FromRadiusMeters { get; init; } = 150;

    /// <summary>Destination match radius in meters (PointToPoint). Defaults to 150.</summary>
    public double ToRadiusMeters { get; init; } = 150;

    /// <summary>Whether ZoneToZone matches both directions. Defaults to true.</summary>
    public bool IsBidirectional { get; init; } = true;

    /// <summary>Bitmask of valid weekdays (1=Mon … 64=Sun). Defaults to all days (127).</summary>
    public int ValidDays { get; init; } = 127;

    /// <summary>Start of the validity window (null = all-day).</summary>
    public TimeOnly? ValidFromTime { get; init; }

    /// <summary>End of the validity window (null = all-day).</summary>
    public TimeOnly? ValidToTime { get; init; }

    /// <summary>Match priority (higher wins). Defaults to 0.</summary>
    public int Priority { get; init; }

    /// <summary>Whether the route is enabled. Defaults to true.</summary>
    public bool IsEnabled { get; init; } = true;
}

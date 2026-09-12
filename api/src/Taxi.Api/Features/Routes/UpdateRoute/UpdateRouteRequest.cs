namespace Taxi.Api.Features.Routes.UpdateRoute;

/// <summary>Request body for PUT /routes/{id}. The id is bound from the route.</summary>
public sealed class UpdateRouteRequest
{
    /// <summary>The route id (from the route).</summary>
    public Guid Id { get; init; }

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

    /// <summary>Origin match radius in meters (PointToPoint).</summary>
    public double FromRadiusMeters { get; init; } = 150;

    /// <summary>Destination match radius in meters (PointToPoint).</summary>
    public double ToRadiusMeters { get; init; } = 150;

    /// <summary>Whether ZoneToZone matches both directions.</summary>
    public bool IsBidirectional { get; init; } = true;

    /// <summary>Bitmask of valid weekdays (1=Mon … 64=Sun).</summary>
    public int ValidDays { get; init; } = 127;

    /// <summary>Start of the validity window (null = all-day).</summary>
    public TimeOnly? ValidFromTime { get; init; }

    /// <summary>End of the validity window (null = all-day).</summary>
    public TimeOnly? ValidToTime { get; init; }

    /// <summary>Match priority (higher wins).</summary>
    public int Priority { get; init; }

    /// <summary>Whether the route is enabled.</summary>
    public bool IsEnabled { get; init; }
}

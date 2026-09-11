using Taxi.Api.Common.Tenancy;

namespace Taxi.Api.Infrastructure.Entities;

/// <summary>A pricing rule that can be applied to orders matching specific origin/destination criteria.</summary>
public class Route : ITenantEntity
{
    /// <summary>Primary key (UUIDv7, app-generated).</summary>
    public Guid Id { get; set; }

    /// <summary>Fleet this route belongs to.</summary>
    public Guid FleetId { get; set; }

    /// <summary>Display name of the route.</summary>
    public required string Name { get; set; }

    /// <summary>Type of origin/destination matching for this route.</summary>
    public RouteType Type { get; set; }

    /// <summary>Fixed price in CZK (integer) for matching orders.</summary>
    public int PriceCzk { get; set; }

    /// <summary>Origin zone for Zone and ZoneToZone routes. Null for PointToPoint routes.</summary>
    public Guid? FromZoneId { get; set; }

    /// <summary>Destination zone for ZoneToZone routes. Null for other route types.</summary>
    public Guid? ToZoneId { get; set; }

    /// <summary>Origin latitude for PointToPoint routes.</summary>
    public double FromLat { get; set; }

    /// <summary>Origin longitude for PointToPoint routes.</summary>
    public double FromLng { get; set; }

    /// <summary>Destination latitude for PointToPoint routes. Null when not applicable.</summary>
    public double? ToLat { get; set; }

    /// <summary>Destination longitude for PointToPoint routes. Null when not applicable.</summary>
    public double? ToLng { get; set; }

    /// <summary>Time of day from which this route is valid. Null means valid all day.</summary>
    public TimeOnly? ValidFromTime { get; set; }

    /// <summary>Time of day until which this route is valid. Null means valid all day.</summary>
    public TimeOnly? ValidToTime { get; set; }

    /// <summary>Bitmask of days of the week this route is valid (1=Mon, 2=Tue, 4=Wed, 8=Thu, 16=Fri, 32=Sat, 64=Sun).</summary>
    public int ValidDays { get; set; }

    /// <summary>Priority for route matching when multiple routes match. Higher is preferred.</summary>
    public int Priority { get; set; }

    /// <summary>Whether this route is currently enabled.</summary>
    public bool IsEnabled { get; set; }

    /// <summary>UTC timestamp when the route was soft-deleted. Null if active.</summary>
    public DateTimeOffset? DeletedAt { get; set; }
}

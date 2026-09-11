using System.Text.Json;
using Taxi.Api.Common.Tenancy;

namespace Taxi.Api.Infrastructure.Entities;

/// <summary>A geographical zone used for zone-based pricing rules.</summary>
public class Zone : ITenantEntity
{
    /// <summary>Primary key (UUIDv7, app-generated).</summary>
    public Guid Id { get; set; }

    /// <summary>Fleet this zone belongs to.</summary>
    public Guid FleetId { get; set; }

    /// <summary>Display name of the zone.</summary>
    public required string Name { get; set; }

    /// <summary>Shape type of this zone (Circle or Polygon).</summary>
    public ZoneShape Shape { get; set; }

    /// <summary>Center latitude for circle zones.</summary>
    public double CenterLat { get; set; }

    /// <summary>Center longitude for circle zones.</summary>
    public double CenterLng { get; set; }

    /// <summary>Radius in meters for circle zones. Null for polygon zones.</summary>
    public double? RadiusMeters { get; set; }

    /// <summary>Array of [lat, lng] coordinate pairs defining the polygon boundary (stored as jsonb). Null for circle zones.</summary>
    public JsonDocument? Polygon { get; set; }

    /// <summary>Whether this zone is currently enabled.</summary>
    public bool IsEnabled { get; set; }
}

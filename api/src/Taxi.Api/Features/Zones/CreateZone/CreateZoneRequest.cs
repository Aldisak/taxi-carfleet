namespace Taxi.Api.Features.Zones.CreateZone;

/// <summary>Request body for POST /zones. A Circle requires CenterLat/Lng + RadiusMeters (no Polygon);
/// a Polygon requires a 3..200-element [lat,lng] array (no RadiusMeters).</summary>
public sealed class CreateZoneRequest
{
    /// <summary>Display name of the zone.</summary>
    public string Name { get; init; } = string.Empty;

    /// <summary>Shape type: "Circle" or "Polygon".</summary>
    public string Shape { get; init; } = string.Empty;

    /// <summary>Center latitude (circle zones).</summary>
    public double CenterLat { get; init; }

    /// <summary>Center longitude (circle zones).</summary>
    public double CenterLng { get; init; }

    /// <summary>Radius in meters (circle zones). Null/absent for polygon zones.</summary>
    public double? RadiusMeters { get; init; }

    /// <summary>Array of [lat,lng] pairs (polygon zones). Null/absent for circle zones.</summary>
    public double[][]? Polygon { get; init; }

    /// <summary>Whether the zone is enabled. Defaults to true.</summary>
    public bool IsEnabled { get; init; } = true;
}

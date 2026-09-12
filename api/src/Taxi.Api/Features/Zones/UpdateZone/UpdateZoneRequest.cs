namespace Taxi.Api.Features.Zones.UpdateZone;

/// <summary>Request body for PUT /zones/{id}. The id is bound from the route.</summary>
public sealed class UpdateZoneRequest
{
    /// <summary>The zone id (from the route).</summary>
    public Guid Id { get; init; }

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

    /// <summary>Whether the zone is enabled.</summary>
    public bool IsEnabled { get; init; }
}

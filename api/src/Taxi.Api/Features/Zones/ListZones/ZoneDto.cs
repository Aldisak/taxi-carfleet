namespace Taxi.Api.Features.Zones.ListZones;

/// <summary>A zone projected for listing.</summary>
/// <param name="Id">Zone primary key.</param>
/// <param name="Name">Display name.</param>
/// <param name="Shape">Shape type ("Circle" or "Polygon").</param>
/// <param name="CenterLat">Center latitude (circle zones).</param>
/// <param name="CenterLng">Center longitude (circle zones).</param>
/// <param name="RadiusMeters">Radius in meters (circle zones); null for polygon zones.</param>
/// <param name="Polygon">Array of [lat,lng] pairs (polygon zones); null for circle zones.</param>
/// <param name="IsEnabled">Whether the zone is enabled.</param>
public record ZoneDto(
    Guid Id,
    string Name,
    string Shape,
    double CenterLat,
    double CenterLng,
    double? RadiusMeters,
    double[][]? Polygon,
    bool IsEnabled);

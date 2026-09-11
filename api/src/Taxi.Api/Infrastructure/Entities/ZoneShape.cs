namespace Taxi.Api.Infrastructure.Entities;

/// <summary>Shape type for a <see cref="Zone"/>.</summary>
public enum ZoneShape
{
    /// <summary>Zone defined by a center point and radius.</summary>
    Circle,

    /// <summary>Zone defined by a polygon of GPS coordinates.</summary>
    Polygon
}

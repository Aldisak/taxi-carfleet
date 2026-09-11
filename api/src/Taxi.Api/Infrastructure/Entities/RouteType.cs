namespace Taxi.Api.Infrastructure.Entities;

/// <summary>Type of a <see cref="Route"/> pricing rule.</summary>
public enum RouteType
{
    /// <summary>Fixed price from one GPS point to another.</summary>
    PointToPoint,

    /// <summary>Fixed price for any ride within a zone.</summary>
    Zone,

    /// <summary>Fixed price from one zone to another.</summary>
    ZoneToZone
}

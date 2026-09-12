namespace Taxi.Api.Features.Routes.ListCommonRoutes;

/// <summary>A single common-route card for the customer Home screen.
/// <para>For PointToPoint routes the pickup/dropoff addresses and coordinates are populated from the
/// Route entity so a logged-out visitor can create an order in 3 taps without geocoding (AC#1).
/// For Zone / ZoneToZone routes the coordinates are null (the customer enters the in-zone address
/// and coordinates come from geocoding); the origin/destination zone references are exposed instead.</para></summary>
/// <param name="Id">Route identifier.</param>
/// <param name="Name">Display name of the route.</param>
/// <param name="Type">Route type (PointToPoint, Zone, ZoneToZone).</param>
/// <param name="PriceCzk">Fixed price in CZK (integer) for this route.</param>
/// <param name="PickupAddress">Human-readable pickup address for PointToPoint routes (the route name). Null for Zone-based routes.</param>
/// <param name="PickupLat">Pickup latitude for PointToPoint routes. Null for Zone-based routes.</param>
/// <param name="PickupLng">Pickup longitude for PointToPoint routes. Null for Zone-based routes.</param>
/// <param name="DropoffAddress">Human-readable dropoff address for PointToPoint routes (the route name). Null for Zone-based routes.</param>
/// <param name="DropoffLat">Dropoff latitude for PointToPoint routes. Null when not applicable.</param>
/// <param name="DropoffLng">Dropoff longitude for PointToPoint routes. Null when not applicable.</param>
/// <param name="FromZoneId">Origin zone id for Zone / ZoneToZone routes. Null for PointToPoint routes.</param>
/// <param name="ToZoneId">Destination zone id for ZoneToZone routes. Null otherwise.</param>
public record CommonRouteDto(
    Guid Id,
    string Name,
    string Type,
    int PriceCzk,
    string? PickupAddress = null,
    double? PickupLat = null,
    double? PickupLng = null,
    string? DropoffAddress = null,
    double? DropoffLat = null,
    double? DropoffLng = null,
    Guid? FromZoneId = null,
    Guid? ToZoneId = null);

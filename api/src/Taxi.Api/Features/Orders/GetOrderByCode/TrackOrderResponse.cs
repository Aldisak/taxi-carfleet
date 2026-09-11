namespace Taxi.Api.Features.Orders.GetOrderByCode;

/// <summary>Reduced tracking DTO returned by GET /orders/by-code/{publicCode}.
/// Contains only public-safe fields — no prices, no customer phone, no IDs beyond publicCode.</summary>
/// <param name="PublicCode">Human-readable 6-char order code.</param>
/// <param name="Status">Current lifecycle status (string name).</param>
/// <param name="PickupAddress">Human-readable pickup address.</param>
/// <param name="DropoffAddress">Human-readable dropoff address. Null if not provided.</param>
/// <param name="ScheduledAt">Scheduled departure time. Null means ASAP.</param>
/// <param name="DriverFirstName">First token of the assigned driver's display name. Null when unassigned.</param>
/// <param name="VehiclePlate">Plate of the assigned vehicle. Null when unassigned.</param>
/// <param name="VehicleColor">Color of the assigned vehicle. Null when unassigned.</param>
/// <param name="EtaMinutes">Estimated minutes until pickup. Always null in v1 (OSRM deferred to assignment 06).</param>
/// <param name="Position">Driver's last known position. Null when driver not on route / no position data.</param>
public record TrackOrderResponse(
    string PublicCode,
    string Status,
    string PickupAddress,
    string? DropoffAddress,
    DateTimeOffset? ScheduledAt,
    string? DriverFirstName,
    string? VehiclePlate,
    string? VehicleColor,
    int? EtaMinutes,
    DriverPositionDto? Position);


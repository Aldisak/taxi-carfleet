namespace Taxi.Api.Features.Public.TrackByCode;

/// <summary>Reduced public tracking DTO returned by GET public/track/{code}.
/// Contains only public-safe fields — no customer phone, no customer id, no allowed actions.</summary>
/// <param name="PublicCode">Human-readable 6-char order code.</param>
/// <param name="Status">Current lifecycle status (string name).</param>
/// <param name="PickupAddress">Human-readable pickup address.</param>
/// <param name="DropoffAddress">Human-readable dropoff address. Null if not provided.</param>
/// <param name="ScheduledAt">Scheduled departure time. Null means ASAP.</param>
/// <param name="DriverFirstName">First token of the assigned driver's display name. Null when unassigned.</param>
/// <param name="VehiclePlate">Plate of the assigned vehicle. Null when unassigned.</param>
/// <param name="VehicleColor">Color of the assigned vehicle. Null when unassigned.</param>
/// <param name="Position">Driver's last known position. Null when driver not on route / no position data.</param>
/// <param name="PriceType">Pricing method (Estimate, Fixed, Meter).</param>
/// <param name="DisplayPriceCzk">Display price in CZK for the customer: fixed price, estimate, or final price when completed. Null when no price is known.</param>
public record TrackByCodeResponse(
    string PublicCode,
    string Status,
    string PickupAddress,
    string? DropoffAddress,
    DateTimeOffset? ScheduledAt,
    string? DriverFirstName,
    string? VehiclePlate,
    string? VehicleColor,
    TrackPositionDto? Position,
    string PriceType,
    int? DisplayPriceCzk);

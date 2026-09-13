namespace Taxi.Api.Features.Orders.Shared;

/// <summary>Summary row for an order, returned in the list endpoint GET /orders.</summary>
/// <param name="Id">Order primary key.</param>
/// <param name="PublicCode">Human-readable 6-char code unique within the fleet.</param>
/// <param name="Status">Current lifecycle status (string name).</param>
/// <param name="Source">How the order was placed (string name).</param>
/// <param name="CustomerPhone">Customer phone number in E.164 format.</param>
/// <param name="CustomerName">Customer display name. Null for app orders without a name.</param>
/// <param name="PickupAddress">Human-readable pickup address.</param>
/// <param name="DropoffAddress">Human-readable dropoff address. Null if not provided.</param>
/// <param name="ScheduledAt">Scheduled departure time. Null means ASAP.</param>
/// <param name="Passengers">Number of passengers.</param>
/// <param name="PriceType">Pricing method (string name).</param>
/// <param name="EstimatedPriceCzk">Estimated price in CZK. Null if not set.</param>
/// <param name="FixedPriceCzk">Fixed price in CZK. Null if not set.</param>
/// <param name="DriverId">Assigned driver ID. Null when unassigned.</param>
/// <param name="CreatedAt">UTC timestamp when the order was created.</param>
/// <param name="HasFailedSms">True if at least one SMS notification for this order failed to send.
/// Lets the dispatcher board render the failed-SMS red icon at a glance without opening each order.</param>
public record OrderSummaryDto(
    Guid Id,
    string PublicCode,
    string Status,
    string Source,
    string CustomerPhone,
    string? CustomerName,
    string PickupAddress,
    string? DropoffAddress,
    DateTimeOffset? ScheduledAt,
    int Passengers,
    string PriceType,
    int? EstimatedPriceCzk,
    int? FixedPriceCzk,
    Guid? DriverId,
    DateTimeOffset CreatedAt,
    bool HasFailedSms);

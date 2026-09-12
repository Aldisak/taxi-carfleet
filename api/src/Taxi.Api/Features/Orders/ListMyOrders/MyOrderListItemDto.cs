namespace Taxi.Api.Features.Orders.ListMyOrders;

/// <summary>A single row in the customer's order history.</summary>
/// <param name="Id">Order identifier.</param>
/// <param name="PublicCode">Human-readable 6-char order code.</param>
/// <param name="Status">Current lifecycle status (string name).</param>
/// <param name="PickupAddress">Pickup address.</param>
/// <param name="DropoffAddress">Dropoff address. Null if not provided.</param>
/// <param name="PriceType">Pricing method (Estimate, Fixed, Meter).</param>
/// <param name="FixedPriceCzk">Fixed price in CZK. Null if not set.</param>
/// <param name="FinalPriceCzk">Final price in CZK. Null until completed.</param>
/// <param name="RatingStars">Customer rating (1..5). Null if not rated.</param>
/// <param name="CreatedAt">UTC timestamp when the order was created.</param>
/// <param name="CompletedAt">UTC timestamp when the order was completed. Null unless completed.</param>
public record MyOrderListItemDto(
    Guid Id,
    string PublicCode,
    string Status,
    string PickupAddress,
    string? DropoffAddress,
    string PriceType,
    int? FixedPriceCzk,
    int? FinalPriceCzk,
    int? RatingStars,
    DateTimeOffset CreatedAt,
    DateTimeOffset? CompletedAt);

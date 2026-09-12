namespace Taxi.Api.Features.Drivers.GetMyOrders;

/// <summary>Summary DTO for a driver's own ride in the orders list.</summary>
public record MyOrderDto(
    Guid Id,
    string PublicCode,
    string Status,
    string PickupAddress,
    string? DropoffAddress,
    string PriceType,
    int? FinalPriceCzk,
    string? PaymentType,
    DateTimeOffset? CompletedAt);

using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Features.Orders.CompleteOrder;

/// <summary>Request body for POST /orders/{id}/complete.</summary>
public sealed class CompleteOrderRequest
{
    /// <summary>Route-bound order ID.</summary>
    public Guid Id { get; set; }

    /// <summary>Final price in CZK. Must be greater than zero.</summary>
    public int FinalPriceCzk { get; set; }

    /// <summary>Payment method used. Must be specified (null means missing — validator rejects).</summary>
    public PaymentType? PaymentType { get; set; }

    /// <summary>Required (≥ 5 chars) when FinalPriceCzk differs from FixedPriceCzk on a Fixed-price order.</summary>
    public string? OverrideReason { get; set; }
}

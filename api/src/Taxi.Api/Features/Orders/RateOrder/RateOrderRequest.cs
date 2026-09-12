namespace Taxi.Api.Features.Orders.RateOrder;

/// <summary>Request for POST /orders/{id}/rating. Route-bound id + rating body.
/// Uses plain (non-required) properties so a missing field surfaces as a 400 validation error
/// rather than a 500 STJ deserialization exception (CLAUDE.md required-STJ trap).</summary>
public sealed class RateOrderRequest
{
    /// <summary>Route-bound order ID.</summary>
    public Guid Id { get; set; }

    /// <summary>Star rating (1..5).</summary>
    public int Stars { get; set; }

    /// <summary>Optional free-text comment (max 500 characters).</summary>
    public string? Comment { get; set; }
}

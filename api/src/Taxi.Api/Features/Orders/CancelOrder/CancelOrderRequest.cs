namespace Taxi.Api.Features.Orders.CancelOrder;

/// <summary>Request body for POST /orders/{id}/cancel.</summary>
public sealed class CancelOrderRequest
{
    /// <summary>Route-bound order ID.</summary>
    public Guid Id { get; set; }

    /// <summary>Reason for cancellation. Must not be empty.</summary>
    public string Reason { get; set; } = string.Empty;
}

namespace Taxi.Api.Features.Orders.AcceptOrder;

/// <summary>Request for POST /orders/{id}/accept. Body is empty; only route parameter is used.</summary>
public sealed class AcceptOrderRequest
{
    /// <summary>Route-bound order ID.</summary>
    public Guid Id { get; set; }
}

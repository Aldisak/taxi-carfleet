namespace Taxi.Api.Features.Orders.ArriveOrder;

/// <summary>Request for POST /orders/{id}/arrive. Body is empty; only route parameter is used.</summary>
public sealed class ArriveOrderRequest
{
    /// <summary>Route-bound order ID.</summary>
    public Guid Id { get; set; }
}

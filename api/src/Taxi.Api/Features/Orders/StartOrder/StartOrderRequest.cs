namespace Taxi.Api.Features.Orders.StartOrder;

/// <summary>Request for POST /orders/{id}/start. Body is empty; only route parameter is used.</summary>
public sealed class StartOrderRequest
{
    /// <summary>Route-bound order ID.</summary>
    public Guid Id { get; set; }
}

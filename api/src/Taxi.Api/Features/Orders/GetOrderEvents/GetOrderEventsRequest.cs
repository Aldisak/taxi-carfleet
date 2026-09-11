namespace Taxi.Api.Features.Orders.GetOrderEvents;

/// <summary>Request for GET /orders/{id}/events.</summary>
public sealed class GetOrderEventsRequest
{
    /// <summary>Route-bound order ID.</summary>
    public Guid Id { get; set; }
}

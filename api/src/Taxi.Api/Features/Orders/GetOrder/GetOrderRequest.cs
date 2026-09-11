namespace Taxi.Api.Features.Orders.GetOrder;

/// <summary>Route parameters for GET /orders/{id}.</summary>
public sealed class GetOrderRequest
{
    /// <summary>Order primary key from the route segment.</summary>
    public Guid Id { get; init; }
}

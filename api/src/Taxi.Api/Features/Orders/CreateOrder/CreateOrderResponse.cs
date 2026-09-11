using Taxi.Api.Features.Orders.Shared;

namespace Taxi.Api.Features.Orders.CreateOrder;

/// <summary>Response body for a successful POST /orders (HTTP 201).</summary>
/// <param name="Order">Full detail of the newly created order.</param>
public record CreateOrderResponse(OrderDetailDto Order);

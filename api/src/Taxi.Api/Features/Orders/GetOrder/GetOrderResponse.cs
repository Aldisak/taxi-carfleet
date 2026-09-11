using Taxi.Api.Features.Orders.Shared;

namespace Taxi.Api.Features.Orders.GetOrder;

/// <summary>Response body for GET /orders/{id}.</summary>
/// <param name="Order">Full order detail including allowed actions for the current caller.</param>
public record GetOrderResponse(OrderDetailDto Order);

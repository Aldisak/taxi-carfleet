using Taxi.Api.Features.Orders.Shared;

namespace Taxi.Api.Features.Orders.UpdateOrder;

/// <summary>Response body for PATCH /orders/{id}.</summary>
/// <param name="Order">Updated order detail including the new Version.</param>
public record UpdateOrderResponse(OrderDetailDto Order);

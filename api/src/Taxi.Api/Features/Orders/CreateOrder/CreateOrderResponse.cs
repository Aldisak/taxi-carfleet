using Taxi.Api.Features.Orders.Shared;

namespace Taxi.Api.Features.Orders.CreateOrder;

/// <summary>Response body for a successful POST /orders (HTTP 201).</summary>
/// <param name="Order">Full detail of the newly created order.</param>
/// <param name="TrackingCode">Public tracking code for the SMS link (customer orders). Null for dispatcher orders.</param>
/// <param name="TrackingToken">Signed tracking token for the SMS link (customer orders). Null for dispatcher orders.</param>
/// <param name="TrackingUrlPath">Relative tracking URL path (/customer/t/{code}?k={token}). Null for dispatcher orders.</param>
public record CreateOrderResponse(
    OrderDetailDto Order,
    string? TrackingCode = null,
    string? TrackingToken = null,
    string? TrackingUrlPath = null);

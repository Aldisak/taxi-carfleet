namespace Taxi.Api.Features.Orders.Shared;

/// <summary>Response body returned by all transition endpoints
/// (assign, reassign, accept, decline, arrive, start, complete, cancel).
/// Contains the updated order detail for client-side state refresh.</summary>
/// <param name="Order">Updated full order detail including allowed actions for the caller.</param>
public record TransitionOrderResponse(OrderDetailDto Order);

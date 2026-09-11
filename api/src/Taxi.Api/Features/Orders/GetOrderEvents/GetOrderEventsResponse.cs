namespace Taxi.Api.Features.Orders.GetOrderEvents;

/// <summary>Response for GET /orders/{id}/events — the chronological list of events for the order.</summary>
/// <param name="Events">Events in ascending chronological order.</param>
public record GetOrderEventsResponse(IReadOnlyList<OrderEventDto> Events);

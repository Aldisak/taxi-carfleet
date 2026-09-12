namespace Taxi.Api.Features.Drivers.GetMyOrders;

/// <summary>Response DTO for a driver's orders list for a given day.</summary>
public record GetMyOrdersResponse(IReadOnlyList<MyOrderDto> Orders);

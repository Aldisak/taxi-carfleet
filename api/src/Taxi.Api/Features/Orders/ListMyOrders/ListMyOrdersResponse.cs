namespace Taxi.Api.Features.Orders.ListMyOrders;

/// <summary>Standard paged list response for the customer's order history.</summary>
/// <param name="Items">The page of order rows, newest first.</param>
/// <param name="Total">Total number of matching orders across all pages.</param>
/// <param name="Page">The 1-based page number returned.</param>
/// <param name="PageSize">The page size used.</param>
public record ListMyOrdersResponse(
    IReadOnlyList<MyOrderListItemDto> Items,
    int Total,
    int Page,
    int PageSize);

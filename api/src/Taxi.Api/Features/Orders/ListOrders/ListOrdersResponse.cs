using Taxi.Api.Features.Orders.Shared;

namespace Taxi.Api.Features.Orders.ListOrders;

/// <summary>Paged list of order summaries.</summary>
/// <param name="Items">Order summaries for the requested page.</param>
/// <param name="Total">Total number of matching orders (across all pages).</param>
/// <param name="Page">Current page number (1-based).</param>
/// <param name="PageSize">Number of items per page.</param>
public record ListOrdersResponse(
    IReadOnlyList<OrderSummaryDto> Items,
    int Total,
    int Page,
    int PageSize);

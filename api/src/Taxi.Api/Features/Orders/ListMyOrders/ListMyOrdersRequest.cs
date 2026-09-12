namespace Taxi.Api.Features.Orders.ListMyOrders;

/// <summary>Request for GET /orders/mine — paged customer order history.</summary>
public sealed class ListMyOrdersRequest
{
    /// <summary>1-based page number. Defaults to 1.</summary>
    public int Page { get; set; } = 1;

    /// <summary>Page size (1..200). Defaults to 20.</summary>
    public int PageSize { get; set; } = 20;
}

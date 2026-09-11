namespace Taxi.Api.Features.Orders.ListOrders;

/// <summary>Query parameters for GET /orders (dispatcher list view).</summary>
public sealed class ListOrdersRequest
{
    /// <summary>Filter by one or more statuses (string values, e.g. "New", "Assigned"). Null means all statuses.</summary>
    public List<string>? Status { get; init; }

    /// <summary>Filter by assigned driver ID. Null means no driver filter.</summary>
    public Guid? DriverId { get; init; }

    /// <summary>Filter orders created at or after this timestamp. Null means no lower bound.</summary>
    public DateTimeOffset? From { get; init; }

    /// <summary>Filter orders created at or before this timestamp. Null means no upper bound.</summary>
    public DateTimeOffset? To { get; init; }

    /// <summary>Search term matching exact PublicCode (case-insensitive), CustomerPhone contains,
    /// or CustomerName ILIKE.</summary>
    public string? Search { get; init; }

    /// <summary>Page number (1-based). Defaults to 1.</summary>
    public int Page { get; init; } = 1;

    /// <summary>Number of items per page. Defaults to 50; maximum 200.</summary>
    public int PageSize { get; init; } = 50;
}

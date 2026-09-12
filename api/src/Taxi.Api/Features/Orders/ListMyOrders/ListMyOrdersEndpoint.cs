using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Infrastructure;

namespace Taxi.Api.Features.Orders.ListMyOrders;

/// <summary>Returns the calling customer's own orders as a standard paged list for the history screen.
/// <para>CustomerOnly, own-rows (CustomerUserId == sub), tenant-safe via the query filter,
/// AsNoTracking, newest first.</para></summary>
internal sealed class ListMyOrdersEndpoint(TaxiDbContext dbContext)
    : Endpoint<ListMyOrdersRequest, ListMyOrdersResponse>
{
    private readonly OrdersFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Get("orders/mine");
        Description(builder => builder
            .WithName(nameof(ListMyOrdersEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.CustomerOnly));

        Summary(s =>
        {
            s.Summary = "List my orders (Customer only)";
            s.Description = "Returns the caller's own orders as a paged list { items, total, page, pageSize }, newest first.";
            s.Responses[StatusCodes.Status200OK] = "A page of the caller's orders.";
            s.Responses[StatusCodes.Status400BadRequest] = "Invalid paging parameters.";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a customer.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(ListMyOrdersRequest req, CancellationToken ct)
    {
        var subClaim = User.FindFirst("sub")?.Value;
        if (!Guid.TryParse(subClaim, out var callerUserId))
        {
            // No resolvable customer identity → empty page (own-rows, no-leak).
            await Send.OkAsync(new ListMyOrdersResponse([], 0, req.Page, req.PageSize), ct);
            return;
        }

        var baseQuery = dbContext.Orders.AsNoTracking()
            .Where(o => o.CustomerUserId == callerUserId);

        var total = await baseQuery.CountAsync(ct);

        var items = await baseQuery
            .OrderByDescending(o => o.CreatedAt)
            .Skip((req.Page - 1) * req.PageSize)
            .Take(req.PageSize)
            .Select(o => new MyOrderListItemDto(
                o.Id,
                o.PublicCode,
                o.Status.ToString(),
                o.PickupAddress,
                o.DropoffAddress,
                o.PriceType.ToString(),
                o.FixedPriceCzk,
                o.FinalPriceCzk,
                o.RatingStars,
                o.CreatedAt,
                o.CompletedAt))
            .ToListAsync(ct);

        await Send.OkAsync(new ListMyOrdersResponse(items, total, req.Page, req.PageSize), ct);
    }
}

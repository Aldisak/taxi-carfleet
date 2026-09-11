using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Features.Orders.Shared;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Features.Orders.ListOrders;

/// <summary>Lists orders for the current tenant with optional filters and paging.
/// Only accessible to Dispatchers and FleetAdmins (DispatcherOnly policy).</summary>
internal sealed class ListOrdersEndpoint(TaxiDbContext dbContext)
    : Endpoint<ListOrdersRequest, ListOrdersResponse>
{
    private readonly OrdersFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Get("orders");
        Description(builder => builder
            .WithName(nameof(ListOrdersEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.DispatcherOnly));

        Summary(s =>
        {
            s.Summary = "List orders";
            s.Description = "Returns a paged list of orders for the current fleet, filtered by status, driver, date range, and search term.";
            s.Responses[StatusCodes.Status200OK] = "Paged list of order summaries.";
            s.Responses[StatusCodes.Status400BadRequest] = "Invalid pagination parameters.";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a Dispatcher or FleetAdmin.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(ListOrdersRequest req, CancellationToken ct)
    {
        var query = dbContext.Orders.AsNoTracking();

        // Status filter: parse string values to OrderStatus enums.
        // Using List<string> in the request avoids FastEndpoints enum-list binding issues.
        if (req.Status is { Count: > 0 })
        {
            var parsedStatuses = req.Status
                .Where(s => Enum.TryParse<OrderStatus>(s, ignoreCase: true, out _))
                .Select(s => Enum.Parse<OrderStatus>(s, ignoreCase: true))
                .ToList();

            if (parsedStatuses.Count > 0)
                query = query.Where(o => parsedStatuses.Contains(o.Status));
        }

        // Driver filter.
        if (req.DriverId.HasValue)
            query = query.Where(o => o.DriverId == req.DriverId.Value);

        // Date range filter on CreatedAt.
        if (req.From.HasValue)
            query = query.Where(o => o.CreatedAt >= req.From.Value);

        if (req.To.HasValue)
            query = query.Where(o => o.CreatedAt <= req.To.Value);

        // Search: exact PublicCode (case-insensitive) OR phone contains OR name ILIKE.
        if (!string.IsNullOrWhiteSpace(req.Search))
        {
            var search = req.Search.Trim();
            query = query.Where(o =>
                EF.Functions.ILike(o.PublicCode, search) ||
                o.CustomerPhone.Contains(search) ||
                (o.CustomerName != null && EF.Functions.ILike(o.CustomerName, $"%{search}%")));
        }

        var total = await query.CountAsync(ct);

        var items = await query
            .OrderByDescending(o => o.CreatedAt)
            .Skip((req.Page - 1) * req.PageSize)
            .Take(req.PageSize)
            .Select(o => new OrderSummaryDto(
                o.Id,
                o.PublicCode,
                o.Status.ToString(),
                o.Source.ToString(),
                o.CustomerPhone,
                o.CustomerName,
                o.PickupAddress,
                o.DropoffAddress,
                o.ScheduledAt,
                o.Passengers,
                o.PriceType.ToString(),
                o.EstimatedPriceCzk,
                o.FixedPriceCzk,
                o.DriverId,
                o.CreatedAt))
            .ToListAsync(ct);

        await Send.OkAsync(new ListOrdersResponse(items, total, req.Page, req.PageSize), ct);
    }
}

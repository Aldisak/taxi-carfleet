using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Features.Orders.GetMyActiveOrder;

/// <summary>Returns the calling customer's single non-terminal order for the Home sticky banner,
/// or 204 No Content when they have none.
/// <para>CustomerOnly, own-rows (CustomerUserId == sub), tenant-safe via the query filter.</para></summary>
internal sealed class GetMyActiveOrderEndpoint(TaxiDbContext dbContext)
    : EndpointWithoutRequest<GetMyActiveOrderResponse>
{
    private static readonly OrderStatus[] ActiveStatuses =
    [
        OrderStatus.New,
        OrderStatus.Assigned,
        OrderStatus.Accepted,
        OrderStatus.Arrived,
        OrderStatus.InProgress
    ];

    private readonly OrdersFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Get("orders/mine/active");
        Description(builder => builder
            .WithName(nameof(GetMyActiveOrderEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.CustomerOnly));

        Summary(s =>
        {
            s.Summary = "Get my active order (Customer only)";
            s.Description = "Returns the caller's single non-terminal order, or 204 when none is active.";
            s.Responses[StatusCodes.Status200OK] = "The caller's active order.";
            s.Responses[StatusCodes.Status204NoContent] = "The caller has no active order.";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a customer.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(CancellationToken ct)
    {
        var subClaim = User.FindFirst("sub")?.Value;
        if (!Guid.TryParse(subClaim, out var callerUserId))
        {
            await Send.NoContentAsync(ct);
            return;
        }

        var active = await dbContext.Orders.AsNoTracking()
            .Where(o => o.CustomerUserId == callerUserId && ActiveStatuses.Contains(o.Status))
            .OrderByDescending(o => o.CreatedAt)
            .Select(o => new GetMyActiveOrderResponse(o.Id, o.PublicCode, o.Status.ToString()))
            .FirstOrDefaultAsync(ct);

        if (active is null) { await Send.NoContentAsync(ct); return; }

        await Send.OkAsync(active, ct);
    }
}

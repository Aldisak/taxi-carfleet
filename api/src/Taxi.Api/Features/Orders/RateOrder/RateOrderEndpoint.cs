using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common;
using Taxi.Api.Common.Features;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Features.Orders.RateOrder;

/// <summary>Lets a customer rate their own completed order exactly once.
/// <para>Access: CustomerOnly, owner-only (CustomerUserId == sub; no-leak 404 otherwise, tenant-scoped
/// via the query filter). The order must be Completed (else 409 Order.NotCompleted) and not already
/// rated (RatedAt == null, else 409 Order.AlreadyRated). On success sets the rating fields and
/// RatedAt = now.</para></summary>
internal sealed class RateOrderEndpoint(TaxiDbContext dbContext, TimeProvider timeProvider)
    : Endpoint<RateOrderRequest>
{
    private readonly OrdersFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Post("orders/{id:guid}/rating");
        Description(builder => builder
            .WithName(nameof(RateOrderEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.CustomerOnly));

        Summary(s =>
        {
            s.Summary = "Rate a completed order (Customer only, once)";
            s.Description = "The owning customer rates their completed order with 1..5 stars and an " +
                            "optional comment. Allowed once; all access denials return 404 (no-leak).";
            s.Responses[StatusCodes.Status204NoContent] = "Rating stored.";
            s.Responses[StatusCodes.Status400BadRequest] = "Stars out of range or comment too long.";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a customer.";
            s.Responses[StatusCodes.Status404NotFound] = "Order not found or caller does not own it.";
            s.Responses[StatusCodes.Status409Conflict] = "Order not completed, or already rated.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(RateOrderRequest req, CancellationToken ct)
    {
        var subClaim = User.FindFirst("sub")?.Value;
        if (!Guid.TryParse(subClaim, out var callerUserId))
        {
            await Send.NotFoundAsync(ct);
            return;
        }

        // Tenant-scoped load (query filter). Track for update.
        var order = await dbContext.Orders
            .FirstOrDefaultAsync(o => o.Id == req.Id, ct);

        if (order is null) { await Send.NotFoundAsync(ct); return; }

        // Owner-only — no-leak 404.
        if (order.CustomerUserId != callerUserId)
        {
            await Send.NotFoundAsync(ct);
            return;
        }

        if (order.Status != OrderStatus.Completed)
        {
            AddError("The order is not completed and cannot be rated.", ErrorCodes.Order.NotCompleted);
            await Send.ErrorsAsync(409, ct);
            return;
        }

        if (order.RatedAt is not null)
        {
            AddError("The order has already been rated.", ErrorCodes.Order.AlreadyRated);
            await Send.ErrorsAsync(409, ct);
            return;
        }

        order.RatingStars = req.Stars;
        order.RatingComment = req.Comment;
        order.RatedAt = timeProvider.GetUtcNow();
        order.Version++;

        await dbContext.SaveChangesAsync(ct);

        await Send.NoContentAsync(ct);
    }
}

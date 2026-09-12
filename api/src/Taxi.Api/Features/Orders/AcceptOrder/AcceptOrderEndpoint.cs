using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Common.Idempotency;
using Taxi.Api.Common.Orders;
using Taxi.Api.Features.Orders.Shared;
using Taxi.Api.Infrastructure;

namespace Taxi.Api.Features.Orders.AcceptOrder;

/// <summary>The assigned driver accepts an order (moves Assigned → Accepted).</summary>
internal sealed class AcceptOrderEndpoint(TaxiDbContext dbContext, OrderService orderService, TimeProvider timeProvider)
    : Endpoint<AcceptOrderRequest, TransitionOrderResponse>
{
    private readonly OrdersFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Post("orders/{id:guid}/accept");
        Description(builder => builder
            .WithName(nameof(AcceptOrderEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.DriverOnly));

        Summary(s =>
        {
            s.Summary = "Accept an assigned order (Driver only)";
            s.Responses[StatusCodes.Status200OK] = "Order accepted, status is now Accepted.";
            s.Responses[StatusCodes.Status404NotFound] = "Order not found or driver not entitled.";
            s.Responses[StatusCodes.Status409Conflict] = "Illegal transition, concurrency conflict, or idempotency error.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(AcceptOrderRequest req, CancellationToken ct)
    {
        await IdempotencyHelper.HandleAsync(HttpContext, dbContext, timeProvider, req,
            async (storeAsync, ct2) =>
            {
                var actor = await ActorResolver.ResolveAsync(User, dbContext, ct2);
                if (actor is null) { await storeAsync(404, null); await Send.NotFoundAsync(ct2); return; }

                var result = await orderService.TransitionAsync(req.Id, OrderTransition.Accept, actor, null, ct2);

                if (!result.IsSuccess)
                {
                    if (result.FailureKind == TransitionFailureKind.NotEntitled)
                    { await storeAsync(404, null); await Send.NotFoundAsync(ct2); return; }

                    AddError(result.FailureMessage ?? "Transition failed.");
                    await storeAsync(409, null);
                    await Send.ErrorsAsync(409, ct2);
                    return;
                }

                var order = await dbContext.Orders.AsNoTracking().FirstOrDefaultAsync(o => o.Id == req.Id, ct2);
                if (order is null) { await storeAsync(404, null); await Send.NotFoundAsync(ct2); return; }

                var isAssignedDriver = actor.DriverId.HasValue && order.DriverId == actor.DriverId;
                var allowedActions = OrderStateMachine.AllowedFor(order.Status, actor.Role, isAssignedDriver)
                    .Select(t => t.ToString().ToLowerInvariant())
                    .ToList();

                var response = new TransitionOrderResponse(OrderDetailMapper.ToDto(order, allowedActions));
                await storeAsync(200, response);
                await Send.OkAsync(response, ct2);
            }, ct);
    }
}

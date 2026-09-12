using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Common.Features;
using Taxi.Api.Common.Idempotency;
using Taxi.Api.Common.Orders;
using Taxi.Api.Features.Orders.Shared;
using Taxi.Api.Infrastructure;

namespace Taxi.Api.Features.Orders.CancelOrder;

/// <summary>Cancels an order. Open to any authenticated role (Dispatcher, Customer, or Driver);
/// the state machine enforces per-role and per-status legality.
/// <para>No <c>Policies()</c> call — all authenticated users are eligible to attempt a cancel;
/// the machine returns <c>NotEntitled</c> for callers who are not permitted, which maps to a
/// no-leak 404.</para>
/// </summary>
internal sealed class CancelOrderEndpoint(TaxiDbContext dbContext, OrderService orderService, TimeProvider timeProvider)
    : Endpoint<CancelOrderRequest, TransitionOrderResponse>
{
    private readonly OrdersFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Post("orders/{id:guid}/cancel");
        Description(builder => builder
            .WithName(nameof(CancelOrderEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        // No Policies() call — any authenticated role may attempt a cancel.
        // Machine enforces the role+status matrix; NotEntitled → 404 no-leak.

        Summary(s =>
        {
            s.Summary = "Cancel an order";
            s.Description = "Dispatcher: New/Assigned/Accepted/Arrived. " +
                            "Customer: New/Assigned/Accepted. " +
                            "Driver: Arrived only (no-show, ≥5 min after ArrivedAt). " +
                            "All other cases: 404 (no-leak) or 409 (illegal transition).";
            s.Responses[StatusCodes.Status200OK] = "Order cancelled.";
            s.Responses[StatusCodes.Status400BadRequest] = "Reason is required.";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated.";
            s.Responses[StatusCodes.Status404NotFound] = "Order not found or caller not entitled.";
            s.Responses[StatusCodes.Status409Conflict] = "Illegal transition, concurrency conflict, or idempotency error.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(CancelOrderRequest req, CancellationToken ct)
    {
        await IdempotencyHelper.HandleAsync(HttpContext, dbContext, timeProvider, req,
            async (storeAsync, ct2) =>
            {
                var actor = await ActorResolver.ResolveAsync(User, dbContext, ct2);
                if (actor is null) { await storeAsync(404, null); await Send.NotFoundAsync(ct2); return; }

                var payload = new CancelPayload(req.Reason);
                var result = await orderService.TransitionAsync(req.Id, OrderTransition.Cancel, actor, payload, ct2);

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

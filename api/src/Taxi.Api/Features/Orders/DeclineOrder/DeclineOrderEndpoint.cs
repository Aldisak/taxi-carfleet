using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Common.Orders;
using Taxi.Api.Features.Orders.Shared;
using Taxi.Api.Infrastructure;

namespace Taxi.Api.Features.Orders.DeclineOrder;

/// <summary>The assigned driver declines an order (moves Assigned → New).</summary>
internal sealed class DeclineOrderEndpoint(TaxiDbContext dbContext, OrderService orderService)
    : Endpoint<DeclineOrderRequest, TransitionOrderResponse>
{
    private readonly OrdersFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Post("orders/{id:guid}/decline");
        Description(builder => builder
            .WithName(nameof(DeclineOrderEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.DriverOnly));

        Summary(s =>
        {
            s.Summary = "Decline an assigned order (Driver only)";
            s.Responses[StatusCodes.Status200OK] = "Order declined, status is back to New.";
            s.Responses[StatusCodes.Status400BadRequest] = "Reason is required.";
            s.Responses[StatusCodes.Status404NotFound] = "Order not found or driver not entitled.";
            s.Responses[StatusCodes.Status409Conflict] = "Illegal transition or concurrency conflict.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(DeclineOrderRequest req, CancellationToken ct)
    {
        var actor = await ActorResolver.ResolveAsync(User, dbContext, ct);
        if (actor is null) { await Send.NotFoundAsync(ct); return; }

        var payload = new DeclinePayload(req.Reason);
        var result = await orderService.TransitionAsync(req.Id, OrderTransition.Decline, actor, payload, ct);

        if (!result.IsSuccess)
        {
            if (result.FailureKind == TransitionFailureKind.NotEntitled)
            { await Send.NotFoundAsync(ct); return; }

            AddError(result.FailureMessage ?? "Transition failed.");
            await Send.ErrorsAsync(409, ct);
            return;
        }

        var order = await dbContext.Orders.AsNoTracking().FirstOrDefaultAsync(o => o.Id == req.Id, ct);
        if (order is null) { await Send.NotFoundAsync(ct); return; }

        var isAssignedDriver = actor.DriverId.HasValue && order.DriverId == actor.DriverId;
        var allowedActions = OrderStateMachine.AllowedFor(order.Status, actor.Role, isAssignedDriver)
            .Select(t => t.ToString().ToLowerInvariant())
            .ToList();

        await Send.OkAsync(new TransitionOrderResponse(OrderDetailMapper.ToDto(order, allowedActions)), ct);
    }
}

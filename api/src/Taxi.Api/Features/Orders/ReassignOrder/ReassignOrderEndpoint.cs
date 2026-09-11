using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Common.Orders;
using Taxi.Api.Features.Orders.Shared;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Features.Orders.ReassignOrder;

/// <summary>Reassigns a driver on an Assigned/Accepted/Arrived order (Dispatcher/FleetAdmin only).</summary>
internal sealed class ReassignOrderEndpoint(TaxiDbContext dbContext, OrderService orderService)
    : Endpoint<ReassignOrderRequest, TransitionOrderResponse>
{
    private readonly OrdersFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Post("orders/{id:guid}/reassign");
        Description(builder => builder
            .WithName(nameof(ReassignOrderEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.DispatcherOnly));

        Summary(s =>
        {
            s.Summary = "Reassign an order to a different driver";
            s.Responses[StatusCodes.Status200OK] = "Order reassigned successfully.";
            s.Responses[StatusCodes.Status400BadRequest] = "Validation error.";
            s.Responses[StatusCodes.Status404NotFound] = "Order not found or driver not in fleet.";
            s.Responses[StatusCodes.Status409Conflict] = "Illegal transition or concurrency conflict.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(ReassignOrderRequest req, CancellationToken ct)
    {
        var actor = await ActorResolver.ResolveAsync(User, dbContext, ct);
        if (actor is null) { await Send.NotFoundAsync(ct); return; }

        var driver = await dbContext.Drivers.AsNoTracking()
            .FirstOrDefaultAsync(d => d.Id == req.DriverId, ct);
        if (driver is null) { await Send.NotFoundAsync(ct); return; }

        var payload = new AssignPayload(driver.Id, driver.CurrentVehicleId);
        var result = await orderService.TransitionAsync(req.Id, OrderTransition.Reassign, actor, payload, ct);

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

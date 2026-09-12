using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common;
using Taxi.Api.Common.Features;
using Taxi.Api.Common.Orders;
using Taxi.Api.Features.Orders.Shared;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Realtime;

namespace Taxi.Api.Features.Orders.UpdateOrder;

/// <summary>Partially updates an order (address, coords, scheduledAt, note, passengers).
/// Allowed only when the order status is New or Assigned. Uses optimistic concurrency via
/// client-supplied version. Writes an Updated OrderEvent and publishes OrderChanged after commit.</summary>
internal sealed class UpdateOrderEndpoint(
    TaxiDbContext dbContext,
    TimeProvider timeProvider,
    IRealtimePublisher realtimePublisher)
    : Endpoint<UpdateOrderRequest, UpdateOrderResponse>
{
    private readonly OrdersFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Patch("orders/{id:guid}");
        Description(builder => builder
            .WithName(nameof(UpdateOrderEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.DispatcherOnly));

        Summary(s =>
        {
            s.Summary = "Partially update an order";
            s.Description = "Updates pickup/dropoff, scheduledAt, note, or passengers for a New/Assigned order. " +
                            "Requires the current version for optimistic concurrency.";
            s.Responses[StatusCodes.Status200OK] = "Order updated successfully.";
            s.Responses[StatusCodes.Status400BadRequest] = "Validation error.";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a dispatcher.";
            s.Responses[StatusCodes.Status404NotFound] = "Order not found or cross-tenant access.";
            s.Responses[StatusCodes.Status409Conflict] = "Order is not editable or client version is stale.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(UpdateOrderRequest req, CancellationToken ct)
    {
        // Resolve caller's user ID from sub claim.
        var subClaim = User.FindFirst("sub")?.Value;
        Guid.TryParse(subClaim, out var callerUserId);

        var order = await dbContext.Orders
            .FirstOrDefaultAsync(o => o.Id == req.Id, ct);

        if (order is null) { await Send.NotFoundAsync(ct); return; }

        // Guard: only New and Assigned orders are editable.
        if (order.Status is not (OrderStatus.New or OrderStatus.Assigned))
        {
            AddError("Order is not in an editable state (must be New or Assigned).", ErrorCodes.Order.NotEditable);
            await Send.ErrorsAsync(409, ct);
            return;
        }

        // Guard: optimistic concurrency — client version must match.
        if (req.Version!.Value != order.Version)
        {
            AddError("The order has been modified by another request. Reload and try again.", ErrorCodes.Order.StaleVersion);
            await Send.ErrorsAsync(409, ct);
            return;
        }

        var now = timeProvider.GetUtcNow();

        // Apply partial updates.
        if (req.PickupAddress is not null)
        {
            order.PickupAddress = req.PickupAddress;
            order.PickupLat = req.PickupLat!.Value;
            order.PickupLng = req.PickupLng!.Value;
        }

        if (req.DropoffAddress is not null)
        {
            order.DropoffAddress = req.DropoffAddress;
            order.DropoffLat = req.DropoffLat!.Value;
            order.DropoffLng = req.DropoffLng!.Value;
        }

        if (req.ScheduledAt.HasValue) order.ScheduledAt = req.ScheduledAt;
        if (req.Note is not null) order.Note = req.Note;
        if (req.Passengers.HasValue) order.Passengers = req.Passengers.Value;

        order.UpdatedAt = now;
        order.Version++;

        // Write the Updated event.
        var updatedEvent = new OrderEvent
        {
            Id = Guid.CreateVersion7(),
            FleetId = order.FleetId,
            OrderId = order.Id,
            Type = OrderEventType.Updated,
            FromStatus = order.Status,
            ToStatus = order.Status,
            ActorUserId = callerUserId == Guid.Empty ? null : callerUserId,
            ActorRole = UserRole.Dispatcher,
            At = now
        };
        dbContext.OrderEvents.Add(updatedEvent);

        await dbContext.SaveChangesAsync(ct);

        // Publish after successful commit.
        await realtimePublisher.OrderChangedAsync(order, ct);

        // Build response — derive allowed actions for the updated order.
        var roleClaim = User.FindFirst("role")?.Value;
        Enum.TryParse<UserRole>(roleClaim, out var role);
        var allowedActions = OrderStateMachine.AllowedFor(order.Status, role, false)
            .Select(t => t.ToString().ToLowerInvariant())
            .ToList();

        await Send.OkAsync(new UpdateOrderResponse(OrderDetailMapper.ToDto(order, allowedActions)), ct);
    }
}

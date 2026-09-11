using System.Text.Json;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Common.Orders;

/// <summary>Pure state machine for <see cref="Order"/> lifecycle transitions.
/// <para>This class contains no I/O — it does not load entities, open transactions, or publish events.
/// All mutations are performed on the order argument in-place; the caller
/// (<see cref="OrderService"/>) is responsible for persisting and broadcasting.</para>
/// <para>Rules: <c>order.Status</c> is ONLY ever changed by this class. OrderService increments
/// <c>order.Version</c> before saving.</para>
/// <para><b>FleetAdmin</b> is treated as Dispatcher-equivalent throughout the transition table,
/// consistent with the DispatcherOnly authorization policy.</para>
/// </summary>
internal static class OrderStateMachine
{
    // Minimum seconds driver must have been at pickup before a no-show cancel is allowed.
    private const int NoShowMinSeconds = 5 * 60;

    /// <summary>Validates and applies <paramref name="transition"/> to <paramref name="order"/>.
    /// Mutates the order on success and returns a result carrying events to persist plus any
    /// driver-status changes the service should apply.</summary>
    /// <param name="order">The tracked order entity to mutate.</param>
    /// <param name="transition">The requested transition.</param>
    /// <param name="actor">Who is performing the transition.</param>
    /// <param name="payload">Typed payload for transitions that require it; null otherwise.</param>
    /// <param name="now">Current UTC time (supplied by OrderService from its TimeProvider).</param>
    public static TransitionResult Apply(
        Order order,
        OrderTransition transition,
        Actor actor,
        object? payload,
        DateTimeOffset now)
    {
        return transition switch
        {
            OrderTransition.Assign => ApplyAssign(order, actor, payload, now),
            OrderTransition.Accept => ApplyAccept(order, actor, now),
            OrderTransition.Decline => ApplyDecline(order, actor, payload, now),
            OrderTransition.Timeout => ApplyTimeout(order, actor, now),
            OrderTransition.Reassign => ApplyReassign(order, actor, payload, now),
            OrderTransition.Arrive => ApplyArrive(order, actor, now),
            OrderTransition.Start => ApplyStart(order, actor, now),
            OrderTransition.Complete => ApplyComplete(order, actor, payload, now),
            OrderTransition.Cancel => ApplyCancel(order, actor, payload, now),
            _ => TransitionResult.Failure(
                TransitionFailureKind.IllegalTransition,
                $"Unknown transition {transition}.")
        };
    }

    /// <summary>Returns the set of transitions allowed for the given combination of order status,
    /// actor role and whether the actor is the assigned driver.
    /// <para>Note: the 5-minute no-show rule for driver Cancel is NOT enforced here — AllowedFor
    /// only reflects the role/status table; the endpoint surfacing 409 before 5 minutes is correct.</para>
    /// </summary>
    public static IReadOnlySet<OrderTransition> AllowedFor(
        OrderStatus status,
        UserRole role,
        bool isAssignedDriver)
    {
        var allowed = new HashSet<OrderTransition>();

        var isDispatcher = role is UserRole.Dispatcher or UserRole.FleetAdmin;
        var isDriver = role == UserRole.Driver;
        var isCustomer = role == UserRole.Customer;
        var isSystem = role == UserRole.System;

        switch (status)
        {
            case OrderStatus.New:
                if (isDispatcher || isSystem) allowed.Add(OrderTransition.Assign);
                if (isDispatcher || isCustomer) allowed.Add(OrderTransition.Cancel);
                break;

            case OrderStatus.Assigned:
                if (isDispatcher) allowed.Add(OrderTransition.Reassign);
                if (isDispatcher || isCustomer) allowed.Add(OrderTransition.Cancel);
                if (isDriver && isAssignedDriver)
                {
                    allowed.Add(OrderTransition.Accept);
                    allowed.Add(OrderTransition.Decline);
                }
                if (isSystem) allowed.Add(OrderTransition.Timeout);
                break;

            case OrderStatus.Accepted:
                if (isDispatcher) allowed.Add(OrderTransition.Reassign);
                if (isDispatcher || isCustomer) allowed.Add(OrderTransition.Cancel);
                if (isDriver && isAssignedDriver) allowed.Add(OrderTransition.Arrive);
                break;

            case OrderStatus.Arrived:
                if (isDispatcher) allowed.Add(OrderTransition.Reassign);
                if (isDispatcher) allowed.Add(OrderTransition.Cancel);
                if (isDriver && isAssignedDriver)
                {
                    allowed.Add(OrderTransition.Start);
                    allowed.Add(OrderTransition.Cancel); // no-show (5-min rule enforced at runtime)
                }
                break;

            case OrderStatus.InProgress:
                if (isDriver && isAssignedDriver) allowed.Add(OrderTransition.Complete);
                break;
        }

        return allowed;
    }

    // ── Individual transitions ────────────────────────────────────────────────

    private static TransitionResult ApplyAssign(Order order, Actor actor, object? payload, DateTimeOffset now)
    {
        var isDispatcher = actor.Role is UserRole.Dispatcher or UserRole.FleetAdmin;
        var isSystem = actor.Role == UserRole.System;

        if (!isDispatcher && !isSystem)
            return Fail(TransitionFailureKind.NotEntitled, "Only Dispatcher, FleetAdmin, or System may assign an order.");

        if (order.Status != OrderStatus.New)
            return Fail(TransitionFailureKind.IllegalTransition, $"Cannot Assign from status {order.Status}.");

        if (payload is not AssignPayload ap)
            return Fail(TransitionFailureKind.IllegalTransition, "Assign requires an AssignPayload.");

        order.Status = OrderStatus.Assigned;
        order.DriverId = ap.DriverId;
        order.VehicleId = ap.VehicleId;
        order.AssignedAt = now;
        order.UpdatedAt = now;

        var ev = MakeEvent(order, OrderEventType.Assigned, OrderStatus.New, OrderStatus.Assigned, actor, now);
        return TransitionResult.Success([ev], []);
    }

    private static TransitionResult ApplyAccept(Order order, Actor actor, DateTimeOffset now)
    {
        if (actor.Role != UserRole.Driver)
            return Fail(TransitionFailureKind.NotEntitled, "Only a Driver may accept an order.");

        if (actor.DriverId != order.DriverId)
            return Fail(TransitionFailureKind.NotEntitled, "Only the assigned driver may accept this order.");

        if (order.Status != OrderStatus.Assigned)
            return Fail(TransitionFailureKind.IllegalTransition, $"Cannot Accept from status {order.Status}.");

        order.Status = OrderStatus.Accepted;
        order.AcceptedAt = now;
        order.UpdatedAt = now;

        var ev = MakeEvent(order, OrderEventType.Accepted, OrderStatus.Assigned, OrderStatus.Accepted, actor, now);
        return TransitionResult.Success([ev], [(actor.DriverId!.Value, DriverStatus.EnRoute)]);
    }

    private static TransitionResult ApplyDecline(Order order, Actor actor, object? payload, DateTimeOffset now)
    {
        if (actor.Role != UserRole.Driver)
            return Fail(TransitionFailureKind.NotEntitled, "Only a Driver may decline an order.");

        if (actor.DriverId != order.DriverId)
            return Fail(TransitionFailureKind.NotEntitled, "Only the assigned driver may decline this order.");

        if (order.Status != OrderStatus.Assigned)
            return Fail(TransitionFailureKind.IllegalTransition, $"Cannot Decline from status {order.Status}.");

        var reason = (payload as DeclinePayload)?.Reason ?? string.Empty;
        var previousDriverId = order.DriverId!.Value;

        order.Status = OrderStatus.New;
        order.DriverId = null;
        order.VehicleId = null;
        order.AssignedAt = null;
        order.UpdatedAt = now;

        // Record the declining driver ID in the payload so auto-dispatch can skip them.
        var eventPayload = JsonDocument.Parse(
            JsonSerializer.Serialize(new { declinedDriverId = previousDriverId, reason }));
        var ev = MakeEvent(order, OrderEventType.Declined, OrderStatus.Assigned, OrderStatus.New, actor, now,
            eventPayload);
        return TransitionResult.Success([ev], []);
    }

    private static TransitionResult ApplyTimeout(Order order, Actor actor, DateTimeOffset now)
    {
        if (actor.Role != UserRole.System)
            return Fail(TransitionFailureKind.NotEntitled, "Only the System may apply a Timeout.");

        if (order.Status != OrderStatus.Assigned)
            return Fail(TransitionFailureKind.IllegalTransition, $"Cannot Timeout from status {order.Status}.");

        var previousDriverId = order.DriverId!.Value;

        order.Status = OrderStatus.New;
        order.DriverId = null;
        order.VehicleId = null;
        order.AssignedAt = null;
        order.UpdatedAt = now;

        var eventPayload = JsonDocument.Parse(
            JsonSerializer.Serialize(new { timedOutDriverId = previousDriverId, reason = "timeout" }));
        var ev = MakeEvent(order, OrderEventType.Timeout, OrderStatus.Assigned, OrderStatus.New, actor, now,
            eventPayload);
        return TransitionResult.Success([ev], []);
    }

    private static TransitionResult ApplyReassign(Order order, Actor actor, object? payload, DateTimeOffset now)
    {
        var isDispatcher = actor.Role is UserRole.Dispatcher or UserRole.FleetAdmin;

        if (!isDispatcher)
            return Fail(TransitionFailureKind.NotEntitled, "Only Dispatcher or FleetAdmin may reassign an order.");

        if (order.Status is not (OrderStatus.Assigned or OrderStatus.Accepted or OrderStatus.Arrived))
            return Fail(TransitionFailureKind.IllegalTransition, $"Cannot Reassign from status {order.Status}.");

        if (payload is not AssignPayload ap)
            return Fail(TransitionFailureKind.IllegalTransition, "Reassign requires an AssignPayload.");

        var releasedDriverId = order.DriverId;
        var fromStatusReassign = order.Status;

        order.Status = OrderStatus.Assigned;
        order.DriverId = ap.DriverId;
        order.VehicleId = ap.VehicleId;
        order.AssignedAt = now;
        order.AcceptedAt = null;
        order.ArrivedAt = null;
        order.UpdatedAt = now;

        var ev = MakeEvent(order, OrderEventType.Reassigned, fromStatusReassign, OrderStatus.Assigned, actor, now);

        List<(Guid, DriverStatus)> driverChanges = [];
        if (releasedDriverId.HasValue)
            driverChanges.Add((releasedDriverId.Value, DriverStatus.Free));

        return TransitionResult.Success([ev], driverChanges, releasedDriverId);
    }

    private static TransitionResult ApplyArrive(Order order, Actor actor, DateTimeOffset now)
    {
        if (actor.Role != UserRole.Driver)
            return Fail(TransitionFailureKind.NotEntitled, "Only a Driver may signal arrival.");

        if (actor.DriverId != order.DriverId)
            return Fail(TransitionFailureKind.NotEntitled, "Only the assigned driver may signal arrival.");

        if (order.Status != OrderStatus.Accepted)
            return Fail(TransitionFailureKind.IllegalTransition, $"Cannot Arrive from status {order.Status}.");

        order.Status = OrderStatus.Arrived;
        order.ArrivedAt = now;
        order.UpdatedAt = now;

        var ev = MakeEvent(order, OrderEventType.Arrived, OrderStatus.Accepted, OrderStatus.Arrived, actor, now);
        return TransitionResult.Success([ev], []);
    }

    private static TransitionResult ApplyStart(Order order, Actor actor, DateTimeOffset now)
    {
        if (actor.Role != UserRole.Driver)
            return Fail(TransitionFailureKind.NotEntitled, "Only a Driver may start the ride.");

        if (actor.DriverId != order.DriverId)
            return Fail(TransitionFailureKind.NotEntitled, "Only the assigned driver may start the ride.");

        if (order.Status != OrderStatus.Arrived)
            return Fail(TransitionFailureKind.IllegalTransition, $"Cannot Start from status {order.Status}.");

        order.Status = OrderStatus.InProgress;
        order.StartedAt = now;
        order.UpdatedAt = now;

        var ev = MakeEvent(order, OrderEventType.Started, OrderStatus.Arrived, OrderStatus.InProgress, actor, now);
        return TransitionResult.Success([ev], [(actor.DriverId!.Value, DriverStatus.Busy)]);
    }

    private static TransitionResult ApplyComplete(Order order, Actor actor, object? payload, DateTimeOffset now)
    {
        if (actor.Role != UserRole.Driver)
            return Fail(TransitionFailureKind.NotEntitled, "Only a Driver may complete the ride.");

        if (actor.DriverId != order.DriverId)
            return Fail(TransitionFailureKind.NotEntitled, "Only the assigned driver may complete the ride.");

        if (order.Status != OrderStatus.InProgress)
            return Fail(TransitionFailureKind.IllegalTransition, $"Cannot Complete from status {order.Status}.");

        if (payload is not CompletePayload cp)
            return Fail(TransitionFailureKind.IllegalTransition, "Complete requires a CompletePayload with finalPriceCzk and paymentType.");

        // Fixed-price override: reason is mandatory and must be >= 5 chars.
        var isPriceOverridden = order.PriceType == PriceType.Fixed
                                && order.FixedPriceCzk.HasValue
                                && cp.FinalPriceCzk != order.FixedPriceCzk.Value;

        if (isPriceOverridden && string.IsNullOrWhiteSpace(cp.OverrideReason))
            return Fail(TransitionFailureKind.IllegalTransition,
                "An override reason is required when the final price differs from the fixed price on a Fixed-price order.");

        if (isPriceOverridden && cp.OverrideReason!.Length < 5)
            return Fail(TransitionFailureKind.IllegalTransition,
                "Override reason must be at least 5 characters.");

        order.Status = OrderStatus.Completed;
        order.FinalPriceCzk = cp.FinalPriceCzk;
        order.PaymentType = cp.PaymentType;
        order.CompletedAt = now;
        order.UpdatedAt = now;

        if (isPriceOverridden)
            order.PriceOverrideReason = cp.OverrideReason;

        var completedEvent = MakeEvent(order, OrderEventType.Completed,
            OrderStatus.InProgress, OrderStatus.Completed, actor, now);

        List<OrderEvent> events = [completedEvent];

        // PriceOverridden is a second event written alongside Completed.
        if (isPriceOverridden)
        {
            var overridePayload = JsonDocument.Parse(JsonSerializer.Serialize(new
            {
                fixedPriceCzk = order.FixedPriceCzk,
                finalPriceCzk = cp.FinalPriceCzk,
                overrideReason = cp.OverrideReason
            }));
            var overrideEvent = MakeEvent(order, OrderEventType.PriceOverridden,
                OrderStatus.InProgress, OrderStatus.Completed, actor, now, overridePayload);
            events.Add(overrideEvent);
        }

        return TransitionResult.Success(events, [(actor.DriverId!.Value, DriverStatus.Free)]);
    }

    private static TransitionResult ApplyCancel(Order order, Actor actor, object? payload, DateTimeOffset now)
    {
        var reason = (payload as CancelPayload)?.Reason ?? string.Empty;
        var isDispatcher = actor.Role is UserRole.Dispatcher or UserRole.FleetAdmin;
        var isCustomer = actor.Role == UserRole.Customer;
        var isDriver = actor.Role == UserRole.Driver;

        // Entitlement + from-status checks per the transition table:
        //   Dispatcher: New/Assigned/Accepted/Arrived
        //   Customer:   New/Assigned/Accepted
        //   Driver:     Arrived only, reason "no-show", >= 5 min after ArrivedAt

        if (!isDispatcher && !isCustomer && !isDriver)
            return Fail(TransitionFailureKind.NotEntitled, "Dispatcher, Customer, or Driver may cancel.");

        if (isCustomer && actor.UserId != order.CustomerUserId)
            return Fail(TransitionFailureKind.NotEntitled, "Customer may only cancel their own order.");

        if (isDriver && actor.DriverId != order.DriverId)
            return Fail(TransitionFailureKind.NotEntitled, "Only the assigned driver may cancel the order.");

        // From-status gate
        if (isDispatcher && order.Status is not (OrderStatus.New or OrderStatus.Assigned
                or OrderStatus.Accepted or OrderStatus.Arrived))
            return Fail(TransitionFailureKind.IllegalTransition,
                $"Dispatcher cannot cancel from status {order.Status}.");

        if (isCustomer && order.Status is not (OrderStatus.New or OrderStatus.Assigned or OrderStatus.Accepted))
            return Fail(TransitionFailureKind.IllegalTransition,
                $"Customer cannot cancel from status {order.Status}.");

        if (isDriver && order.Status != OrderStatus.Arrived)
            return Fail(TransitionFailureKind.IllegalTransition,
                "Driver may only cancel from Arrived status (no-show).");

        // Driver no-show: must be >= 5 min after ArrivedAt and reason must be "no-show".
        if (isDriver)
        {
            if (order.ArrivedAt is null)
                return Fail(TransitionFailureKind.IllegalTransition, "ArrivedAt is not set.");

            var elapsed = (now - order.ArrivedAt.Value).TotalSeconds;
            if (elapsed < NoShowMinSeconds)
                return Fail(TransitionFailureKind.IllegalTransition,
                    $"Driver no-show cancel requires at least 5 minutes at pickup. Elapsed: {elapsed:F0}s.");

            if (reason != "no-show")
                return Fail(TransitionFailureKind.IllegalTransition,
                    "Driver cancellation reason must be 'no-show'.");
        }

        var driverWasAssigned = order.DriverId.HasValue;
        var assignedDriverId = order.DriverId;
        var fromStatus = order.Status;

        order.Status = OrderStatus.Cancelled;
        order.CancelledAt = now;
        order.CancelReason = reason;
        order.CancelledByRole = actor.Role;
        order.UpdatedAt = now;
        // Note: DriverId is intentionally NOT cleared on cancel per the transition table.

        var ev = MakeEvent(order, OrderEventType.Cancelled,
            fromStatus, OrderStatus.Cancelled, actor, now,
            JsonDocument.Parse(JsonSerializer.Serialize(new { reason })));

        List<(Guid, DriverStatus)> driverChanges = [];
        if (driverWasAssigned && assignedDriverId.HasValue)
            driverChanges.Add((assignedDriverId.Value, DriverStatus.Free));

        return TransitionResult.Success([ev], driverChanges);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static TransitionResult Fail(TransitionFailureKind kind, string message)
        => TransitionResult.Failure(kind, message);

    private static OrderEvent MakeEvent(
        Order order,
        OrderEventType type,
        OrderStatus from,
        OrderStatus to,
        Actor actor,
        DateTimeOffset at,
        JsonDocument? payload = null)
        => new()
        {
            Id = Guid.CreateVersion7(),
            FleetId = order.FleetId,
            OrderId = order.Id,
            Type = type,
            FromStatus = from,
            ToStatus = to,
            ActorUserId = actor.UserId,
            ActorRole = actor.Role,
            Payload = payload,
            At = at
        };
}

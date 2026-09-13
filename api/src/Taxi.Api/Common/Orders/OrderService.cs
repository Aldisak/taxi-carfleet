using Microsoft.EntityFrameworkCore;
using Taxi.Api.Common.Notifications;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Realtime;

namespace Taxi.Api.Common.Orders;

/// <summary>Transactional order-transition service. This is the single entry point for
/// all callers that need to advance an order through the state machine.
/// <para><b>Two or more consumers</b> (transition endpoints in WI-09, offer-timeout job in WI-14,
/// seed data in WI-15) justify its placement in <c>Common/Orders/</c> as a shared service,
/// per <c>rules/architecture.md#common-infrastructure</c>. Endpoints still own
/// <c>HandleAsync</c> and delegate the transactional step here.</para>
/// <para><b>Version increment</b>: <c>order.Version</c> is incremented inside this method,
/// immediately before <c>SaveChangesAsync</c>. EF Core adds <c>Version</c> to the UPDATE WHERE
/// clause; the increment must be explicit because EF does not auto-increment concurrency tokens.</para>
/// </summary>
internal sealed class OrderService(
    TaxiDbContext dbContext,
    TimeProvider timeProvider,
    IRealtimePublisher publisher,
    INotificationService notificationService)
{
    /// <summary>Loads the order, applies the transition via <see cref="OrderStateMachine"/>,
    /// updates driver statuses, saves order + events in one transaction, then publishes
    /// <c>OrderChanged</c> (and <c>DriverStatusChanged</c> where applicable) <b>only after commit</b>.</summary>
    /// <param name="orderId">ID of the order to transition.</param>
    /// <param name="transition">The requested transition.</param>
    /// <param name="actor">Who is performing the transition.</param>
    /// <param name="payload">Typed payload required by some transitions; null otherwise.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>The transition result. On <see cref="TransitionFailureKind.StaleVersion"/> the
    /// caller should refetch and retry or return 409 to the client.</returns>
    public async Task<TransitionResult> TransitionAsync(
        Guid orderId,
        OrderTransition transition,
        Actor actor,
        object? payload,
        CancellationToken ct)
    {
        // Load the order tracked (required for concurrency check via Version).
        var order = await dbContext.Orders.FirstOrDefaultAsync(o => o.Id == orderId, ct);

        if (order is null)
            return TransitionResult.Failure(TransitionFailureKind.NotEntitled,
                $"Order {orderId} not found (or not visible in current tenant).");

        var now = timeProvider.GetUtcNow();
        var result = OrderStateMachine.Apply(order, transition, actor, payload, now);

        if (!result.IsSuccess)
            return result;

        // Apply driver-status side effects.
        foreach (var (driverId, newStatus) in result.DriverStatusChanges)
        {
            var driver = await dbContext.Drivers.FirstOrDefaultAsync(d => d.Id == driverId, ct);
            if (driver is not null)
                driver.Status = newStatus;
        }

        // Add events to the context.
        dbContext.OrderEvents.AddRange(result.Events);

        // Enqueue notification-outbox rows in the SAME transaction (AC#3) — BEFORE SaveChanges,
        // never in the post-commit publish block. NotificationService only ADDS rows to this
        // DbContext; it does not save. If SaveChanges below rolls back, the outbox rows roll back too.
        if (MapTransitionToEvent(transition, actor) is { } notificationEvent)
            await notificationService.NotifyAsync(notificationEvent, order, ct);

        // Increment Version before saving — EF uses it in the WHERE clause.
        order.Version++;

        try
        {
            await dbContext.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            return TransitionResult.Failure(TransitionFailureKind.StaleVersion,
                "The order was modified concurrently. Please reload and retry.");
        }

        // Publish ONLY after commit — never before, to avoid broadcasting rolled-back state.
        await publisher.OrderChangedAsync(order, ct);

        foreach (var (driverId, newStatus) in result.DriverStatusChanges)
            await publisher.DriverStatusChangedAsync(driverId, order.FleetId, newStatus, ct);

        // Publish NewOrderOffered on Assign and Reassign so the offered driver can start
        // their countdown. expiresAt = AssignedAt + OfferTimeoutSeconds (same calculation
        // as OfferTimeoutJob — ensures the driver countdown and the server timeout are identical).
        if (transition is OrderTransition.Assign or OrderTransition.Reassign
            && order.DriverId is { } offeredDriverId)
        {
            var timeout = await dbContext.FleetSettings
                .Where(s => s.FleetId == order.FleetId)
                .Select(s => (int?)s.OfferTimeoutSeconds)
                .FirstOrDefaultAsync(ct) ?? 45;

            var expiresAt = order.AssignedAt!.Value.AddSeconds(timeout);
            await publisher.NewOrderOfferedAsync(order, offeredDriverId, expiresAt, ct);
        }

        return result;
    }

    /// <summary>Maps a state-machine transition (and the acting role) to the notification event it
    /// triggers. Returns null for transitions that do not notify.</summary>
    private static NotificationEvent? MapTransitionToEvent(OrderTransition transition, Actor actor)
        => transition switch
        {
            OrderTransition.Assign => NotificationEvent.OfferToDriver,
            OrderTransition.Reassign => NotificationEvent.OfferToDriver,
            OrderTransition.Accept => NotificationEvent.DriverAssigned,
            OrderTransition.Arrive => NotificationEvent.DriverArrived,
            OrderTransition.Start => NotificationEvent.RideStarted,
            OrderTransition.Complete => NotificationEvent.RideCompleted,
            OrderTransition.Decline => NotificationEvent.DriverDeclined,
            OrderTransition.Timeout => NotificationEvent.DriverTimedOut,
            OrderTransition.Cancel => actor.Role == UserRole.Customer
                ? NotificationEvent.OrderCancelledByCustomer
                : NotificationEvent.OrderCancelledByFleet,
            _ => null
        };
}

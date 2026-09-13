using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Common.Notifications;

/// <summary>Pure, data-driven routing for notification events. Resolves which recipient roles
/// receive a notification on which channel, keyed on (event, order source, whether the customer
/// has a push subscription). No DbContext, no IO. Static matrix exactly matching assignment §1;
/// modelled so a per-fleet override is trivial later but NOT built here.</summary>
public static class NotificationRouting
{
    /// <summary>Resolves the recipient/channel set for an event.</summary>
    /// <param name="evt">The business event.</param>
    /// <param name="source">How the order was placed (Phone has no customer app).</param>
    /// <param name="customerHasPush">Whether the customer has a live push subscription.</param>
    /// <returns>The list of (recipient role, channel) deliveries for this event.</returns>
    public static IReadOnlyList<NotificationRecipientChannel> Resolve(
        NotificationEvent evt,
        OrderSource source,
        bool customerHasPush)
    {
        var isPhoneOrder = source == OrderSource.Phone;

        return evt switch
        {
            // ── Customer-facing order lifecycle ──────────────────────────────
            // Phone order: customer has no app → SMS for Created + Arrived ONLY.
            NotificationEvent.OrderCreatedForCustomer =>
                CustomerPushPreferredSmsFallback(customerHasPush, isPhoneOrder),

            NotificationEvent.DriverAssigned =>
                CustomerPushPreferredSmsFallback(customerHasPush, isPhoneOrder: false, phoneOrderSkips: isPhoneOrder),

            // DriverArrived: SMS ALWAYS (plus push when subscribed). The one that matters most.
            NotificationEvent.DriverArrived =>
                DriverArrived(customerHasPush),

            // Push only — skipped entirely for phone orders (no app).
            NotificationEvent.RideStarted =>
                PushOnlyCustomer(isPhoneOrder),

            NotificationEvent.RideCompleted =>
                PushOnlyCustomer(isPhoneOrder),

            NotificationEvent.OrderCancelledByFleet =>
                CustomerPushPreferredSmsFallback(customerHasPush, isPhoneOrder: false, phoneOrderSkips: isPhoneOrder),

            // ── Staff / driver events (push) ─────────────────────────────────
            NotificationEvent.OrderCancelledByCustomer =>
            [
                new(NotificationRecipientRole.Driver, NotificationChannel.Push),
                new(NotificationRecipientRole.Dispatcher, NotificationChannel.Push)
            ],

            NotificationEvent.OfferToDriver =>
                [new(NotificationRecipientRole.Driver, NotificationChannel.Push)],

            NotificationEvent.DriverDeclined =>
                [new(NotificationRecipientRole.Dispatcher, NotificationChannel.Push)],

            NotificationEvent.DriverTimedOut =>
                [new(NotificationRecipientRole.Dispatcher, NotificationChannel.Push)],

            NotificationEvent.NewAppOrderForDispatch =>
                [new(NotificationRecipientRole.Dispatcher, NotificationChannel.Push)],

            NotificationEvent.ScheduledOrderReminder =>
            [
                new(NotificationRecipientRole.Driver, NotificationChannel.Push),
                new(NotificationRecipientRole.Dispatcher, NotificationChannel.Push)
            ],

            _ => []
        };
    }

    // Customer: push when subscribed, else SMS. For a phone order (OrderCreated), always SMS.
    private static IReadOnlyList<NotificationRecipientChannel> CustomerPushPreferredSmsFallback(
        bool customerHasPush, bool isPhoneOrder, bool phoneOrderSkips = false)
    {
        if (phoneOrderSkips)
            return [];

        if (isPhoneOrder)
            return [new(NotificationRecipientRole.Customer, NotificationChannel.Sms)];

        return customerHasPush
            ? [new(NotificationRecipientRole.Customer, NotificationChannel.Push)]
            : [new(NotificationRecipientRole.Customer, NotificationChannel.Sms)];
    }

    private static IReadOnlyList<NotificationRecipientChannel> DriverArrived(bool customerHasPush)
    {
        // SMS always; push additionally when subscribed.
        var list = new List<NotificationRecipientChannel>
        {
            new(NotificationRecipientRole.Customer, NotificationChannel.Sms)
        };
        if (customerHasPush)
            list.Add(new(NotificationRecipientRole.Customer, NotificationChannel.Push));
        return list;
    }

    private static IReadOnlyList<NotificationRecipientChannel> PushOnlyCustomer(bool isPhoneOrder)
        => isPhoneOrder
            ? []
            : [new(NotificationRecipientRole.Customer, NotificationChannel.Push)];
}

namespace Taxi.Api.Infrastructure.Entities;

/// <summary>The business event that triggers a notification. Drives routing (which recipients and
/// channels) and template selection. Stored as a string in <c>notification_outbox</c> and
/// <c>notification_log</c>.</summary>
public enum NotificationEvent
{
    /// <summary>Order was created — customer is informed (with tracking link).</summary>
    OrderCreatedForCustomer,

    /// <summary>A driver accepted the order — customer learns who is coming.</summary>
    DriverAssigned,

    /// <summary>The driver has arrived at pickup — the most important customer message.</summary>
    DriverArrived,

    /// <summary>The ride has started.</summary>
    RideStarted,

    /// <summary>The ride has completed (with rating link).</summary>
    RideCompleted,

    /// <summary>The fleet cancelled the order — customer is informed.</summary>
    OrderCancelledByFleet,

    /// <summary>The customer cancelled the order — driver and dispatcher are informed.</summary>
    OrderCancelledByCustomer,

    /// <summary>A new order is offered to a driver (high priority).</summary>
    OfferToDriver,

    /// <summary>A driver declined an offer — dispatcher is informed.</summary>
    DriverDeclined,

    /// <summary>A driver's offer timed out — dispatcher is informed.</summary>
    DriverTimedOut,

    /// <summary>A new app-placed order needs dispatcher attention.</summary>
    NewAppOrderForDispatch,

    /// <summary>A scheduled order reminder (T-30 to dispatch, T-15 to driver). Routing support only;
    /// the scheduling trigger is a follow-up job (not built in UC-005).</summary>
    ScheduledOrderReminder,

    /// <summary>The monthly SMS cost cap is near (90%); a warning push is sent to the FleetAdmin.</summary>
    SmsCapWarning
}

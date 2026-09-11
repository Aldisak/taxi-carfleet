namespace Taxi.Api.Common.Orders;

/// <summary>All valid state-machine transitions for an <see cref="Taxi.Api.Infrastructure.Entities.Order"/>.
/// Drives <see cref="OrderStateMachine.Apply"/> and <see cref="OrderStateMachine.AllowedFor"/>.</summary>
public enum OrderTransition
{
    /// <summary>Dispatcher or System assigns a driver to a New order → Assigned.</summary>
    Assign,

    /// <summary>The assigned driver accepts the offer → Accepted.</summary>
    Accept,

    /// <summary>The assigned driver declines the offer → New.</summary>
    Decline,

    /// <summary>System times out an unanswered offer → New.</summary>
    Timeout,

    /// <summary>Dispatcher reassigns to a different driver (Assigned/Accepted/Arrived → Assigned).</summary>
    Reassign,

    /// <summary>The assigned driver arrives at pickup → Arrived.</summary>
    Arrive,

    /// <summary>The assigned driver starts the ride → InProgress.</summary>
    Start,

    /// <summary>The assigned driver completes the ride → Completed.</summary>
    Complete,

    /// <summary>Dispatcher, Customer, or Driver (no-show) cancels the order → Cancelled.</summary>
    Cancel
}

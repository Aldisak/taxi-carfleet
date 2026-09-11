namespace Taxi.Api.Common.Orders;

/// <summary>Discriminator for why <see cref="OrderStateMachine.Apply"/> or
/// <see cref="OrderService.TransitionAsync"/> rejected a transition.</summary>
public enum TransitionFailureKind
{
    /// <summary>The actor is not entitled to perform this transition:
    /// wrong role, or a driver other than the assigned driver.</summary>
    NotEntitled,

    /// <summary>The actor is entitled but the transition is illegal from the current order status,
    /// or a business rule is violated (e.g. 5-min no-show rule, missing finalPrice/paymentType).</summary>
    IllegalTransition,

    /// <summary>The order was modified concurrently; the client holds a stale version.
    /// Added by <see cref="OrderService"/> on <see cref="Microsoft.EntityFrameworkCore.DbUpdateConcurrencyException"/>.
    /// The state machine never produces this kind.</summary>
    StaleVersion
}

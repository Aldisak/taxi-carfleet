using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Common.Orders;

/// <summary>Result of <see cref="OrderStateMachine.Apply"/> or <see cref="OrderService.TransitionAsync"/>.
/// <para>On success: <see cref="IsSuccess"/> is true, <see cref="Events"/> carries 1–2 events to persist
/// (2 when a <see cref="OrderEventType.PriceOverridden"/> event accompanies <see cref="OrderEventType.Completed"/>),
/// and <see cref="DriverStatusChanges"/> carries Driver.Status mutations the service must apply.</para>
/// <para>On failure: <see cref="IsSuccess"/> is false and <see cref="FailureKind"/> carries the reason.</para>
/// </summary>
public sealed class TransitionResult
{
    private TransitionResult() { }

    /// <summary>Whether the transition was accepted.</summary>
    public bool IsSuccess { get; private init; }

    /// <summary>Events to persist. Non-empty only when <see cref="IsSuccess"/> is true.
    /// Usually one event; two when <see cref="OrderEventType.PriceOverridden"/> is also emitted.</summary>
    public IReadOnlyList<OrderEvent> Events { get; private init; } = [];

    /// <summary>Driver-status mutations the service must apply after a successful transition.
    /// Empty when no driver status changes. Key = DriverId, Value = new DriverStatus.</summary>
    public IReadOnlyList<(Guid DriverId, DriverStatus NewStatus)> DriverStatusChanges { get; private init; } = [];

    /// <summary>When the Reassign transition is applied, the previously-assigned driver's ID.
    /// Null for all other transitions. The service releases this driver to Free.</summary>
    public Guid? ReleasedDriverId { get; private init; }

    /// <summary>Reason for failure. Null when <see cref="IsSuccess"/> is true.</summary>
    public TransitionFailureKind? FailureKind { get; private init; }

    /// <summary>Human-readable failure message for logging. Null when <see cref="IsSuccess"/> is true.</summary>
    public string? FailureMessage { get; private init; }

    /// <summary>Creates a successful result.</summary>
    internal static TransitionResult Success(
        IReadOnlyList<OrderEvent> events,
        IReadOnlyList<(Guid, DriverStatus)> driverStatusChanges,
        Guid? releasedDriverId = null)
        => new()
        {
            IsSuccess = true,
            Events = events,
            DriverStatusChanges = driverStatusChanges,
            ReleasedDriverId = releasedDriverId
        };

    /// <summary>Creates a failure result.</summary>
    internal static TransitionResult Failure(TransitionFailureKind kind, string message)
        => new() { IsSuccess = false, FailureKind = kind, FailureMessage = message };
}

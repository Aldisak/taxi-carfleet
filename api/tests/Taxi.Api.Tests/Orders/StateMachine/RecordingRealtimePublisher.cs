using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Realtime;

namespace Taxi.Api.Tests.Orders.StateMachine;

/// <summary>Recording fake for <see cref="IRealtimePublisher"/> used in integration tests.
/// Captures all calls so tests can assert publish-after-commit behaviour.</summary>
internal sealed class RecordingRealtimePublisher : IRealtimePublisher
{
    private readonly List<Order> _orderChangedCalls = [];
    private readonly List<(Guid DriverId, DriverStatus Status)> _driverStatusChangedCalls = [];

    /// <summary>Orders passed to <see cref="OrderChangedAsync"/>.</summary>
    public IReadOnlyList<Order> OrderChangedCalls => _orderChangedCalls;

    /// <summary>Driver status changes passed to <see cref="DriverStatusChangedAsync"/>.</summary>
    public IReadOnlyList<(Guid DriverId, DriverStatus Status)> DriverStatusChangedCalls => _driverStatusChangedCalls;

    /// <inheritdoc />
    public ValueTask OrderChangedAsync(Order order, CancellationToken ct)
    {
        _orderChangedCalls.Add(order);
        return ValueTask.CompletedTask;
    }

    /// <inheritdoc />
    public ValueTask DriverStatusChangedAsync(Guid driverId, Guid fleetId, DriverStatus status, CancellationToken ct)
    {
        _driverStatusChangedCalls.Add((driverId, status));
        return ValueTask.CompletedTask;
    }

    /// <inheritdoc />
    public ValueTask DriverPositionChangedAsync(
        Guid driverId, double lat, double lng, double? heading, double? speed,
        DateTimeOffset at, CancellationToken ct) => ValueTask.CompletedTask;

    /// <inheritdoc />
    public ValueTask NewOrderOfferedAsync(Order order, Guid driverId, DateTimeOffset expiresAt, CancellationToken ct)
        => ValueTask.CompletedTask;
}

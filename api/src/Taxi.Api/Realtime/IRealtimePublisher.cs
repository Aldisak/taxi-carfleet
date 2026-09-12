using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Realtime;

/// <summary>Abstraction over the SignalR realtime layer. Implementations broadcast
/// state changes to connected clients. The no-op implementation is registered in
/// development/testing; the real SignalR implementation is wired in WI-13.</summary>
internal interface IRealtimePublisher
{
    /// <summary>Broadcasts an order state change to the fleet dispatch group,
    /// the assigned driver group, and the order-specific group.</summary>
    /// <param name="order">The updated order (post-transition state).</param>
    /// <param name="ct">Cancellation token.</param>
    ValueTask OrderChangedAsync(Order order, CancellationToken ct);

    /// <summary>Broadcasts a driver availability/status change to the fleet dispatch group
    /// and the driver's own group.</summary>
    /// <param name="driverId">The driver whose status changed.</param>
    /// <param name="fleetId">The fleet the driver belongs to (routes to the dispatch group).</param>
    /// <param name="status">The new driver status.</param>
    /// <param name="ct">Cancellation token.</param>
    ValueTask DriverStatusChangedAsync(Guid driverId, Guid fleetId, DriverStatus status, CancellationToken ct);

    /// <summary>Broadcasts a driver position update.</summary>
    /// <param name="driverId">The driver whose position changed.</param>
    /// <param name="lat">Latitude.</param>
    /// <param name="lng">Longitude.</param>
    /// <param name="heading">Heading in degrees (0–360). Null if unknown.</param>
    /// <param name="speed">Speed in km/h. Null if unknown.</param>
    /// <param name="at">UTC timestamp of the position reading.</param>
    /// <param name="ct">Cancellation token.</param>
    ValueTask DriverPositionChangedAsync(
        Guid driverId,
        double lat,
        double lng,
        double? heading,
        double? speed,
        DateTimeOffset at,
        CancellationToken ct);

    /// <summary>Broadcasts a new order offer to a specific driver.
    /// Called by <see cref="Taxi.Api.Common.Orders.OrderService"/> after a successful Assign or Reassign
    /// transition, post-commit, alongside <see cref="OrderChangedAsync"/>. The service loads
    /// <c>OfferTimeoutSeconds</c> from FleetSettings (default 45) and computes
    /// <paramref name="expiresAt"/> = <c>order.AssignedAt + timeout</c>, identical to
    /// the value used by <c>OfferTimeoutJob</c> so the driver countdown and the server timeout
    /// are the same instant.</summary>
    /// <param name="order">The newly-assigned order.</param>
    /// <param name="driverId">The driver to notify.</param>
    /// <param name="expiresAt">UTC instant when the offer expires (AssignedAt + OfferTimeoutSeconds).</param>
    /// <param name="ct">Cancellation token.</param>
    ValueTask NewOrderOfferedAsync(Order order, Guid driverId, DateTimeOffset expiresAt, CancellationToken ct);
}

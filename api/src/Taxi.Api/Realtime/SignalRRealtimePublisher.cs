using Microsoft.AspNetCore.SignalR;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Realtime;

/// <summary>SignalR-backed <see cref="IRealtimePublisher"/> that broadcasts order and driver
/// state changes to connected clients via <see cref="FleetHub"/>.
/// <para>Registered as a singleton; depends only on <see cref="IHubContext{THub}"/> which is
/// also a singleton.</para>
/// </summary>
internal sealed class SignalRRealtimePublisher(IHubContext<FleetHub> hubContext) : IRealtimePublisher
{
    /// <inheritdoc />
    public async ValueTask OrderChangedAsync(Order order, CancellationToken ct)
    {
        var dto = OrderChangedDto.From(order);

        // Broadcast to fleet dispatch group.
        await hubContext.Clients
            .Group($"fleet:{order.FleetId}:dispatch")
            .SendAsync("OrderChanged", dto, ct);

        // Broadcast to the order-specific group (customer tracking).
        await hubContext.Clients
            .Group($"order:{order.Id}")
            .SendAsync("OrderChanged", dto, ct);

        // Broadcast to the assigned driver group (if any).
        if (order.DriverId.HasValue)
        {
            await hubContext.Clients
                .Group($"driver:{order.DriverId.Value}")
                .SendAsync("OrderChanged", dto, ct);
        }
    }

    /// <inheritdoc />
    public async ValueTask DriverStatusChangedAsync(Guid driverId, Guid fleetId, DriverStatus status, CancellationToken ct)
    {
        var payload = new { driverId, status };

        // Broadcast to the fleet dispatch group so dispatchers see the availability change.
        await hubContext.Clients
            .Group($"fleet:{fleetId}:dispatch")
            .SendAsync("DriverStatusChanged", payload, ct);

        // Broadcast to the driver's own group.
        await hubContext.Clients
            .Group($"driver:{driverId}")
            .SendAsync("DriverStatusChanged", payload, ct);
    }

    /// <inheritdoc />
    public async ValueTask DriverPositionChangedAsync(
        Guid driverId,
        double lat,
        double lng,
        double? heading,
        double? speed,
        DateTimeOffset at,
        CancellationToken ct)
    {
        // Called from external callers (background jobs, admin tools).
        // FleetHub.UpdatePosition broadcasts directly. Without fleetId we broadcast to the driver group only.
        await hubContext.Clients
            .Group($"driver:{driverId}")
            .SendAsync("DriverPositionChanged", new { driverId, lat, lng, heading, speed, at }, ct);
    }

    /// <inheritdoc />
    public async ValueTask NewOrderOfferedAsync(Order order, Guid driverId, DateTimeOffset expiresAt, CancellationToken ct)
    {
        var dto = OrderChangedDto.From(order);
        await hubContext.Clients
            .Group($"driver:{driverId}")
            .SendAsync("NewOrderOffered", dto, expiresAt, ct);
    }
}

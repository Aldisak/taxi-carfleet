using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Realtime;

/// <summary>Payload sent to SignalR clients on the <c>OrderChanged</c> event.
/// Hand-written DTO to avoid EF navigation cycles when serializing the <c>Order</c> entity.
/// <para>Version (F-01): included so real-time subscribers can detect stale optimistic edits
/// without re-fetching the full order detail.</para>
/// <para>Source (F-B5/B6): included as a string so the web <c>decideSound</c> gate
/// (<c>source === 'App'</c>) is reachable. Serialized as a string (enum → ToString()) so
/// SignalR's default JSON protocol (which does not apply <c>JsonStringEnumConverter</c> and
/// would otherwise emit a numeric value) sends the expected literal <c>"App"</c> /
/// <c>"Dispatcher"</c> / <c>"Phone"</c>.</para></summary>
internal sealed record OrderChangedDto(
    Guid Id,
    Guid FleetId,
    string PublicCode,
    OrderStatus Status,
    Guid? DriverId,
    Guid? CustomerUserId,
    DateTimeOffset UpdatedAt,
    int Version,
    string Source)
{
    /// <summary>Projects an <see cref="Order"/> entity into this DTO.</summary>
    /// <param name="order">The source order entity.</param>
    /// <returns>Populated DTO.</returns>
    internal static OrderChangedDto From(Order order) =>
        new(order.Id, order.FleetId, order.PublicCode, order.Status,
            order.DriverId, order.CustomerUserId, order.UpdatedAt, order.Version,
            order.Source.ToString());
}

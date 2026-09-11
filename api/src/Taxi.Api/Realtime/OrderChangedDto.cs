using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Realtime;

/// <summary>Payload sent to SignalR clients on the <c>OrderChanged</c> event.
/// Hand-written DTO to avoid EF navigation cycles when serializing the <c>Order</c> entity.</summary>
internal sealed record OrderChangedDto(
    Guid Id,
    Guid FleetId,
    string PublicCode,
    OrderStatus Status,
    Guid? DriverId,
    Guid? CustomerUserId,
    DateTimeOffset UpdatedAt)
{
    /// <summary>Projects an <see cref="Order"/> entity into this DTO.</summary>
    /// <param name="order">The source order entity.</param>
    /// <returns>Populated DTO.</returns>
    internal static OrderChangedDto From(Order order) =>
        new(order.Id, order.FleetId, order.PublicCode, order.Status,
            order.DriverId, order.CustomerUserId, order.UpdatedAt);
}

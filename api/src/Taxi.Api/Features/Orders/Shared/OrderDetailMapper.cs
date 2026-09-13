using Taxi.Api.Common.Orders;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Features.Orders.Shared;

/// <summary>Shared projection helper for building <see cref="OrderDetailDto"/> from an
/// <see cref="Order"/> entity. Used by transition endpoints to return the updated order detail
/// after a successful state transition.</summary>
internal static class OrderDetailMapper
{
    /// <summary>Creates an <see cref="OrderDetailDto"/> from the given order entity and pre-computed
    /// allowed actions list.</summary>
    /// <param name="order">The order entity (loaded AsNoTracking).</param>
    /// <param name="allowedActions">The list of lowercase allowed action names for the current caller.</param>
    public static OrderDetailDto ToDto(Order order, IReadOnlyList<string> allowedActions)
        => new(
            order.Id,
            order.PublicCode,
            order.Status.ToString(),
            order.Source.ToString(),
            order.CustomerPhone,
            order.CustomerName,
            order.PickupAddress,
            order.PickupLat,
            order.PickupLng,
            order.DropoffAddress,
            order.DropoffLat,
            order.DropoffLng,
            order.ScheduledAt,
            order.Note,
            order.Passengers,
            order.PriceType.ToString(),
            order.EstimatedPriceCzk,
            order.FixedPriceCzk,
            order.FinalPriceCzk,
            order.PaymentType?.ToString(),
            order.DriverId,
            order.VehicleId,
            order.CreatedAt,
            order.UpdatedAt,
            allowedActions,
            order.Version);

    /// <summary>Maps loaded <see cref="NotificationLog"/> rows (AsNoTracking, tenant-scoped, ordered by
    /// CreatedAt) to the order-detail notifications list.</summary>
    /// <param name="rows">The notification-log rows for the order.</param>
    public static IReadOnlyList<OrderNotificationDto> ToNotificationDtos(IEnumerable<NotificationLog> rows)
        => rows
            .Select(l => new OrderNotificationDto(
                l.Event.ToString(),
                l.Channel.ToString(),
                l.Recipient,
                l.Status.ToString(),
                l.Error,
                l.CreatedAt,
                l.SentAt))
            .ToList();
}

using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Common.Notifications;

/// <summary>Enqueues notifications as transactional-outbox rows. <see cref="NotifyAsync"/> ADDS rows
/// to the caller's scoped <c>TaxiDbContext</c> change-tracker WITHOUT calling SaveChanges and WITHOUT
/// opening a new scope — so the outbox rows commit atomically with the order change that triggered
/// them (AC#3). The actual send happens later in the dispatch job (A5).</summary>
internal interface INotificationService
{
    /// <summary>Resolves recipients + channels for the event, applies the monthly SMS cost cap, and
    /// adds <see cref="NotificationOutbox"/> rows (and any <c>SkippedCap</c> log rows) to the current
    /// DbContext. Does not save.</summary>
    /// <param name="evt">The business event.</param>
    /// <param name="order">The order the event relates to.</param>
    /// <param name="ct">Cancellation token.</param>
    Task NotifyAsync(NotificationEvent evt, Order order, CancellationToken ct);
}

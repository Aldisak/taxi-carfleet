using Microsoft.EntityFrameworkCore;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Common.Notifications;

/// <summary>Enqueues notification-outbox rows in the caller's scoped <c>TaxiDbContext</c> (AC#3).
/// Resolves recipients via the pure <see cref="NotificationRouting"/> matrix, applies the monthly SMS
/// cost cap (<see cref="NotificationCostCap"/>), and adds outbox rows — it never calls SaveChanges and
/// never opens a new scope. Rendering of bodies is deferred to the dispatch job (A5).</summary>
internal sealed class NotificationService(
    TaxiDbContext dbContext,
    TimeProvider timeProvider,
    ILogger<NotificationService> logger) : INotificationService
{
    /// <inheritdoc />
    public async Task NotifyAsync(NotificationEvent evt, Order order, CancellationToken ct)
    {
        var now = timeProvider.GetUtcNow();

        // Does the customer have a live push subscription? (Null customer user = phone-only customer.)
        var customerHasPush = order.CustomerUserId is { } customerUserId
            && await dbContext.PushSubscriptions.IgnoreQueryFilters()
                .AnyAsync(p => p.UserId == customerUserId, ct);

        var deliveries = NotificationRouting.Resolve(evt, order.Source, customerHasPush);
        if (deliveries.Count == 0) return;

        // Monthly SMS spend for the cap (count Sent SMS log rows in the current month window).
        var monthStart = new DateTimeOffset(now.Year, now.Month, 1, 0, 0, 0, TimeSpan.Zero);
        var capCzk = await dbContext.FleetSettings.IgnoreQueryFilters()
            .Where(fs => fs.FleetId == order.FleetId)
            .Select(fs => (int?)fs.SmsMonthlyCapCzk)
            .FirstOrDefaultAsync(ct) ?? 500;
        var unitCostCzk = await dbContext.FleetSettings.IgnoreQueryFilters()
            .Where(fs => fs.FleetId == order.FleetId)
            .Select(fs => (int?)fs.SmsUnitCostCzk)
            .FirstOrDefaultAsync(ct) ?? 1;
        var smsSentThisMonth = await dbContext.NotificationLog.IgnoreQueryFilters()
            .CountAsync(l => l.FleetId == order.FleetId
                && l.Channel == NotificationChannel.Sms
                && l.Status == NotificationStatus.Sent
                && l.SentAt >= monthStart, ct);
        var sentCzk = smsSentThisMonth * unitCostCzk;

        foreach (var delivery in deliveries)
        {
            await EnqueueDeliveryAsync(evt, order, delivery, sentCzk, capCzk, unitCostCzk, now, ct);
        }
    }

    private async Task EnqueueDeliveryAsync(
        NotificationEvent evt,
        Order order,
        NotificationRecipientChannel delivery,
        int sentCzk,
        int capCzk,
        int unitCostCzk,
        DateTimeOffset now,
        CancellationToken ct)
    {
        // SMS cost-cap check (push is always allowed).
        if (delivery.Channel == NotificationChannel.Sms)
        {
            // 90% warning: enqueue a push to the FleetAdmin so they can act before the cap bites (AC#6).
            // Dedup at send time collapses repeats (same event+order+recipient+channel) to one per order.
            if (NotificationCostCap.IsAtWarningThreshold(sentCzk, capCzk))
                await AddStaffOutboxAsync(NotificationEvent.SmsCapWarning, order,
                    NotificationChannel.Push, [UserRole.FleetAdmin], now, ct);

            var decision = NotificationCostCap.Decide(sentCzk, capCzk, unitCostCzk, evt, delivery.Channel);
            if (decision == CapDecision.SkipCap)
            {
                // Record a SkippedCap log row directly (same DbContext, no SaveChanges) so the
                // dispatcher can see the skip. The SkippedCap key differs from a later Sent row.
                dbContext.NotificationLog.Add(new NotificationLog
                {
                    Id = Guid.CreateVersion7(),
                    FleetId = order.FleetId,
                    Event = evt,
                    OrderId = order.Id,
                    Channel = delivery.Channel,
                    Recipient = order.CustomerPhone,
                    Status = NotificationStatus.SkippedCap,
                    Error = "SmsCapReached",
                    CreatedAt = now
                });
                logger.LogInformation("SMS skipped over cap {OrderId} {FleetId} {Reason}",
                    order.Id, order.FleetId, "SmsCapReached");
                return;
            }
        }

        switch (delivery.Recipient)
        {
            case NotificationRecipientRole.Customer:
                AddOutbox(evt, order, delivery.Channel,
                    recipientUserId: delivery.Channel == NotificationChannel.Push ? order.CustomerUserId : null,
                    recipientPhone: delivery.Channel == NotificationChannel.Sms ? order.CustomerPhone : null,
                    now);
                break;

            case NotificationRecipientRole.Driver:
                if (order.DriverId is { } driverId)
                {
                    var driverUserId = await dbContext.Drivers.IgnoreQueryFilters()
                        .Where(d => d.Id == driverId)
                        .Select(d => (Guid?)d.UserId)
                        .FirstOrDefaultAsync(ct);
                    if (driverUserId is { } duid)
                        AddOutbox(evt, order, delivery.Channel, recipientUserId: duid, recipientPhone: null, now);
                }
                break;

            case NotificationRecipientRole.Dispatcher:
                await AddStaffOutboxAsync(evt, order, delivery.Channel,
                    [UserRole.Dispatcher, UserRole.FleetAdmin], now, ct);
                break;

            case NotificationRecipientRole.FleetAdmin:
                await AddStaffOutboxAsync(evt, order, delivery.Channel, [UserRole.FleetAdmin], now, ct);
                break;
        }
    }

    private async Task AddStaffOutboxAsync(
        NotificationEvent evt, Order order, NotificationChannel channel,
        UserRole[] roles, DateTimeOffset now, CancellationToken ct)
    {
        var staffUserIds = await dbContext.Users.IgnoreQueryFilters()
            .Where(u => u.FleetId == order.FleetId && u.IsActive && roles.Contains(u.Role))
            .Select(u => u.Id)
            .ToListAsync(ct);

        foreach (var uid in staffUserIds)
            AddOutbox(evt, order, channel, recipientUserId: uid, recipientPhone: null, now);
    }

    private void AddOutbox(
        NotificationEvent evt, Order order, NotificationChannel channel,
        Guid? recipientUserId, string? recipientPhone, DateTimeOffset now)
    {
        dbContext.NotificationOutbox.Add(new NotificationOutbox
        {
            Id = Guid.CreateVersion7(),
            FleetId = order.FleetId,
            Event = evt,
            OrderId = order.Id,
            Channel = channel,
            RecipientUserId = recipientUserId,
            RecipientPhone = recipientPhone,
            RecipientEndpoint = null,
            Attempts = 0,
            NextAttemptAt = now,
            Status = NotificationStatus.Queued,
            CreatedAt = now
        });
    }
}

using Microsoft.EntityFrameworkCore;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Infrastructure.Notifications;

namespace Taxi.Api.Infrastructure.Geo;

/// <summary>Sends Web Push alerts to FleetAdmin users when a fleet's monthly geo credit usage crosses
/// the 80% or 100% threshold of <see cref="FleetSettings.GeoMonthlyCreditBudget"/>.
/// Each threshold fires at most once per fleet per calendar month (idempotent via <see cref="GeoBudgetAlertMarker"/>).
/// Registered as Scoped; uses <see cref="IServiceScopeFactory"/> to open a fresh scope per alert check
/// so the <see cref="CurrentTenant"/> is set correctly without polluting the caller's DbContext.</summary>
internal sealed class GeoBudgetAlertService(
    IServiceScopeFactory scopeFactory,
    TimeProvider timeProvider,
    ILogger<GeoBudgetAlertService> logger)
{
    private static readonly int[] Thresholds = [80, 100];

    private static readonly TimeZoneInfo PragueZone =
        TimeZoneInfo.FindSystemTimeZoneById("Europe/Prague");

    /// <summary>Checks whether the fleet's month-to-date geo credits have crossed either alert threshold
    /// and, for each newly-crossed threshold, sends a push to all FleetAdmin subscriptions and writes
    /// an idempotency marker.</summary>
    /// <param name="fleetId">The fleet that just consumed a geo credit.</param>
    /// <param name="ct">Cancellation token.</param>
    public async Task CheckAndAlertAsync(Guid fleetId, CancellationToken ct)
    {
        // Prague-local calendar month for the alert window and marker key.
        var pragueNow = TimeZoneInfo.ConvertTime(timeProvider.GetUtcNow(), PragueZone);
        var year = pragueNow.Year;
        var month = pragueNow.Month;
        var monthStart = new DateOnly(year, month, 1);
        var monthEnd = monthStart.AddMonths(1);

        await using var scope = scopeFactory.CreateAsyncScope();

        // Set tenant so query filters apply to this fleet.
        var tenant = scope.ServiceProvider.GetRequiredService<CurrentTenant>();
        tenant.FleetId = fleetId;

        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        // Get the fleet's monthly budget (defaults to 250 000 when no FleetSettings row).
        var budget = await db.FleetSettings
            .AsNoTracking()
            .Where(s => s.FleetId == fleetId)
            .Select(s => (int?)s.GeoMonthlyCreditBudget)
            .FirstOrDefaultAsync(ct)
            ?? 250_000;

        if (budget <= 0) return;

        // Sum month-to-date credits (IgnoreQueryFilters: GeoUsage has no query filter).
        var creditsUsed = await db.GeoUsage
            .IgnoreQueryFilters()
            .Where(u => u.FleetId == fleetId && u.Day >= monthStart && u.Day < monthEnd)
            .SumAsync(u => (int?)u.CreditsEst, ct) ?? 0;

        var pushSender = scope.ServiceProvider.GetRequiredService<IPushSender>();

        foreach (var threshold in Thresholds)
        {
            // Integer crossing check: creditsUsed * 100 >= threshold * budget
            if ((long)creditsUsed * 100 < (long)threshold * budget) continue;

            // Check idempotency marker (query filter scoped to fleetId).
            var markerExists = await db.GeoBudgetAlertMarkers
                .AnyAsync(m => m.Year == year && m.Month == month && m.Threshold == threshold, ct);
            if (markerExists)
            {
                logger.LogDebug("Skipped geo budget alert {FleetId} {Year} {Month} {Threshold} {Reason}",
                    fleetId, year, month, threshold, "MarkerExists");
                continue;
            }

            // Find FleetAdmin users and their push subscriptions.
            var adminUserIds = await db.Users
                .AsNoTracking()
                .Where(u => u.FleetId == fleetId && u.IsActive && u.Role == UserRole.FleetAdmin)
                .Select(u => u.Id)
                .ToListAsync(ct);

            var title = threshold == 100
                ? "Geo kredit vyčerpán"
                : "Geo kredit na 80 %";
            var body = threshold == 100
                ? $"Váš měsíční limit geo kreditů byl vyčerpán ({creditsUsed:N0} / {budget:N0}). Volání jsou omezena."
                : $"Dosáhli jste 80 % měsíčního limitu geo kreditů ({creditsUsed:N0} / {budget:N0}).";

            var message = new PushMessage(
                Title: title,
                Body: body,
                Url: "/dispatcher/settings",
                Tag: $"geo-budget-{threshold}-{year}-{month}",
                Priority: "normal");

            foreach (var userId in adminUserIds)
            {
                var subscriptions = await db.PushSubscriptions
                    .IgnoreQueryFilters()
                    .AsNoTracking()
                    .Where(p => p.UserId == userId)
                    .ToListAsync(ct);

                foreach (var sub in subscriptions)
                {
                    try
                    {
                        var result = await pushSender.SendAsync(sub, message, ct);
                        if (result.Outcome == PushSendOutcome.Gone)
                        {
                            logger.LogDebug("Push subscription gone {FleetId} {Threshold} {SubscriptionId}",
                                fleetId, threshold, sub.Id);
                        }
                    }
                    catch (Exception ex) when (ex is not OperationCanceledException)
                    {
                        logger.LogWarning(ex, "Push failed {FleetId} {Threshold} {Reason}",
                            fleetId, threshold, "PushException");
                    }
                }
            }

            // Write idempotency marker (regardless of individual send outcomes).
            db.GeoBudgetAlertMarkers.Add(new GeoBudgetAlertMarker
            {
                Id = Guid.CreateVersion7(),
                FleetId = fleetId,
                Year = year,
                Month = month,
                Threshold = threshold,
                SentAt = timeProvider.GetUtcNow()
            });
            await db.SaveChangesAsync(ct);

            logger.LogInformation("Geo budget alert sent {FleetId} {Year} {Month} {Threshold} {CreditsUsed} {Budget}",
                fleetId, year, month, threshold, creditsUsed, budget);
        }
    }
}

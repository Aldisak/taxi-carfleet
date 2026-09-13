using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Infrastructure.Notifications;

namespace Taxi.Api.Common.Ops;

/// <summary>Counts HTTP 5xx responses in a fixed one-minute (tumbling) window — the window is the calendar
/// minute <c>floor(UtcTicks / 60s)</c> and resets when the minute rolls over — and fires EXACTLY ONE push
/// alert per window to the active FleetAdmins of the ops fleet (<c>Ops:FleetSlug</c>) when the count exceeds
/// the threshold. Tumbling (not sliding) is a deliberate cheapest-possible-pager choice matching the spec's
/// "reset at the next window". Registered as a singleton — the window state persists across requests — so it resolves
/// <see cref="TaxiDbContext"/> and <see cref="IPushSender"/> from its own scope (mirrors OfferTimeoutJob).
/// The counter is hit from concurrent request threads; the count and the single-fire guard are lock-protected.
/// An alert-send failure logs a Warning and never throws (infra-alert failure must not cascade).</summary>
internal sealed class FiveHundredRateAlerter(
    IServiceScopeFactory scopeFactory,
    TimeProvider timeProvider,
    IOptions<OpsOptions> options,
    ILogger<FiveHundredRateAlerter> logger)
{
    private static readonly TimeSpan WindowSize = TimeSpan.FromMinutes(1);

    private readonly Lock _gate = new();
    private long _windowTicks = -1;
    private int _count;
    private bool _fired;

    /// <summary>Records one 5xx response. When the count first exceeds
    /// <see cref="OpsOptions.MaxServerErrorsPerMinute"/> within the current minute window, fires exactly
    /// one alert for that window. Never throws.</summary>
    /// <param name="ct">Cancellation token.</param>
    public async Task RecordServerErrorAsync(CancellationToken ct)
    {
        bool shouldFire;
        var now = timeProvider.GetUtcNow();
        var currentWindow = now.UtcDateTime.Ticks / WindowSize.Ticks;

        lock (_gate)
        {
            if (currentWindow != _windowTicks)
            {
                _windowTicks = currentWindow;
                _count = 0;
                _fired = false;
            }

            _count++;
            shouldFire = _count > options.Value.MaxServerErrorsPerMinute && !_fired;
            if (shouldFire) _fired = true;
        }

        if (!shouldFire) return;

        try
        {
            await SendAlertAsync(ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // Infra-alert failure must not cascade into the request pipeline (rules/error-handling.md).
            logger.LogWarning(ex, "5xx alert send failed {Reason}", "AlertSendException");
        }
    }

    private async Task SendAlertAsync(CancellationToken ct)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var pushSender = scope.ServiceProvider.GetRequiredService<IPushSender>();
        var slug = options.Value.FleetSlug;

        // Resolve the ops fleet by slug, then its active FleetAdmin push subscriptions.
        // IgnoreQueryFilters: this runs in a null-tenant scope (like NotificationService recipient lookup).
        var opsFleetId = await db.Fleets.IgnoreQueryFilters()
            .Where(f => f.Slug == slug && f.IsActive)
            .Select(f => (Guid?)f.Id)
            .FirstOrDefaultAsync(ct);

        if (opsFleetId is not { } fleetId)
        {
            logger.LogWarning("5xx alert skipped {Reason} {OpsFleetSlug}", "OpsFleetNotFound", slug);
            return;
        }

        var subscriptions = await db.PushSubscriptions.IgnoreQueryFilters()
            .Where(p => db.Users.IgnoreQueryFilters().Any(u =>
                u.Id == p.UserId
                && u.FleetId == fleetId
                && u.IsActive
                && u.Role == UserRole.FleetAdmin))
            .ToListAsync(ct);

        if (subscriptions.Count == 0)
        {
            logger.LogWarning("5xx alert skipped {Reason} {OpsFleetId}", "NoOpsFleetAdminSubscriptions", fleetId);
            return;
        }

        var message = new PushMessage(
            Title: "Taxi API: 5xx spike",
            Body: "More than the tolerated number of server errors occurred in the last minute.",
            Url: "/x",
            Tag: "ops-5xx-alert",
            Priority: "high");

        foreach (var subscription in subscriptions)
            await pushSender.SendAsync(subscription, message, ct);

        logger.LogWarning("5xx alert sent {OpsFleetId} {RecipientCount}", fleetId, subscriptions.Count);
    }
}

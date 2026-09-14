using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Infrastructure.Notifications;

namespace Taxi.Api.Infrastructure.Jobs;

/// <summary>Hosted service that fires every Monday at 06:00 Europe/Prague and sends a weekly Web Push
/// KPI digest to each active fleet's FleetAdmin users.
/// <para>
/// <b>Trigger semantics</b>: <c>ExecuteAsync</c> ticks every 5 minutes via <see cref="PeriodicTimer"/>.
/// Each tick calls <see cref="RunTickAsync"/> which checks whether the current Prague-local time is
/// Monday ≥ 06:00. If not, it exits immediately (no-op). This avoids an exact-tick dependency while
/// still processing within minutes of the Monday 06:00 window opening.
/// </para>
/// <para>
/// <b>Idempotency</b>: a <see cref="WeeklyDigestMarker"/> row keyed on (FleetId, IsoYear, IsoWeek) is
/// written once per fleet per ISO week. If the job restarts or overlaps, the existing marker prevents
/// re-sending. The marker is written regardless of whether individual push sends returned Gone or Failed —
/// partial failures are logged but do not block the marker.
/// </para>
/// <para>
/// <b>Testability</b>: business logic lives in <see cref="RunTickAsync"/>. <c>ExecuteAsync</c> is a
/// thin PeriodicTimer shell. Tests pin a Monday clock and call <c>RunTickAsync</c> directly —
/// deterministic, no timer waits.
/// </para>
/// </summary>
internal sealed class WeeklyDigestJob(
    IServiceScopeFactory scopeFactory,
    TimeProvider timeProvider,
    ILogger<WeeklyDigestJob> logger) : BackgroundService
{
    private static readonly TimeSpan TickInterval = TimeSpan.FromMinutes(5);
    private static readonly TimeZoneInfo PragueZone =
        TimeZoneInfo.FindSystemTimeZoneById("Europe/Prague");

    /// <inheritdoc />
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TickInterval, timeProvider);

        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                await RunTickAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Tick failed {Reason}", "UnhandledTickException");
            }
        }
    }

    /// <summary>Performs one digest tick. Called by <c>ExecuteAsync</c> and directly by integration tests.</summary>
    /// <param name="ct">Cancellation token.</param>
    public async Task RunTickAsync(CancellationToken ct)
    {
        var now = timeProvider.GetUtcNow();
        var pragueNow = TimeZoneInfo.ConvertTime(now, PragueZone);

        // Only run on Monday at or after 06:00 Prague local
        if (pragueNow.DayOfWeek != DayOfWeek.Monday || pragueNow.Hour < 6)
        {
            logger.LogDebug("Skipped {Reason} {PragueDay}", "NotMonday06", pragueNow.DayOfWeek);
            return;
        }

        // Last ISO week: since today is Monday, last ISO week ended yesterday (Sunday)
        // ISOWeek.GetWeekOfYear on Sunday gives us last week's number
        var lastWeekDate = DateOnly.FromDateTime(pragueNow.DateTime).AddDays(-1); // Sunday of last week
        var isoYear = ISOWeek.GetYear(lastWeekDate.ToDateTime(TimeOnly.MinValue));
        var isoWeek = ISOWeek.GetWeekOfYear(lastWeekDate.ToDateTime(TimeOnly.MinValue));

        // Last ISO week window (Prague local → UTC)
        var weekStart = ToUtc(ISOWeek.ToDateTime(isoYear, isoWeek, DayOfWeek.Monday));
        var weekEnd = weekStart.AddDays(7);
        var priorWeekStart = weekStart.AddDays(-7);

        // Scan: get all active fleet IDs (IgnoreQueryFilters: system cross-tenant scan)
        List<Guid> fleetIds;
        await using (var scanScope = scopeFactory.CreateAsyncScope())
        {
            var scanDb = scanScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
            fleetIds = await scanDb.Fleets
                .IgnoreQueryFilters()  // cross-tenant system scan
                .AsNoTracking()
                .Where(f => f.IsActive)
                .Select(f => f.Id)
                .ToListAsync(ct);
        }

        // Process each fleet in an isolated scope (poisoned change-tracker isolation)
        foreach (var fleetId in fleetIds)
        {
            try
            {
                await ProcessFleetAsync(fleetId, isoYear, isoWeek, weekStart, weekEnd, priorWeekStart, ct);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning(ex, "Fleet failed {FleetId} {IsoWeek} {Reason}",
                    fleetId, isoWeek, "PerFleetException");
            }
        }
    }

    /// <summary>Processes a single fleet: checks idempotency marker, computes digest, sends push,
    /// writes marker. Uses a fresh scope so change-tracker failures in one fleet don't leak to others.</summary>
    private async Task ProcessFleetAsync(
        Guid fleetId, int isoYear, int isoWeek,
        DateTimeOffset weekStart, DateTimeOffset weekEnd, DateTimeOffset priorWeekStart,
        CancellationToken ct)
    {
        await using var scope = scopeFactory.CreateAsyncScope();

        // Set tenant context so query filters work (marker check, recipient lookup)
        var tenant = scope.ServiceProvider.GetRequiredService<CurrentTenant>();
        tenant.FleetId = fleetId;

        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        // Idempotency: skip if marker already exists for this fleet + ISO week
        var markerExists = await db.WeeklyDigestMarkers
            .AnyAsync(m => m.IsoYear == isoYear && m.IsoWeek == isoWeek, ct);
        if (markerExists)
        {
            logger.LogDebug("Skipped {FleetId} {IsoYear} {IsoWeek} {Reason}",
                fleetId, isoYear, isoWeek, "MarkerExists");
            return;
        }

        // Aggregate this ISO week and prior (IgnoreQueryFilters: orders not tenant-filtered by default via marker scope)
        // We use direct fleet_id filter since we're in tenant scope, but IgnoreQueryFilters for cross-fleet system agg
        var weekAgg = await AggregateWeekAsync(db, fleetId, weekStart, weekEnd, ct);
        var priorAgg = await AggregateWeekAsync(db, fleetId, priorWeekStart, weekStart, ct);

        // Skip fleets with zero rides in both weeks
        if (weekAgg.Rides == 0 && priorAgg.Rides == 0)
        {
            logger.LogDebug("Skipped {FleetId} {IsoWeek} {Reason}",
                fleetId, isoWeek, "ZeroActivity");
            return;
        }

        // Top driver by rides this week (first name only — no PII beyond given name)
        var topDriverFirstName = await GetTopDriverFirstNameAsync(db, fleetId, weekStart, weekEnd, ct);

        // Compute delta %
        var deltaText = ComputeDeltaText(weekAgg.Rides, priorAgg.Rides);

        // Build Czech push message
        var title = "Týdenní přehled";
        var avgRatingText = weekAgg.AvgRating.HasValue
            ? $" | Hodnocení: {weekAgg.AvgRating.Value:F1}"
            : string.Empty;
        var topDriverText = topDriverFirstName is not null
            ? $" | Nejlepší řidič: {topDriverFirstName}"
            : string.Empty;
        var body =
            $"Týden {isoWeek}: {weekAgg.Rides} jízd ({deltaText}), " +
            $"tržby {weekAgg.RevenueCzk} Kč" +
            avgRatingText +
            topDriverText;

        var message = new PushMessage(
            Title: title,
            Body: body,
            Url: "/dispatcher/analytics",
            Tag: $"weekly-digest-{isoYear}-{isoWeek}",
            Priority: "normal");

        // Find FleetAdmin users with push subscriptions for this fleet
        var adminUserIds = await db.Users
            .AsNoTracking()
            .Where(u => u.FleetId == fleetId
                     && u.IsActive
                     && u.Role == UserRole.FleetAdmin)
            .Select(u => u.Id)
            .ToListAsync(ct);

        var pushSender = scope.ServiceProvider.GetRequiredService<IPushSender>();
        var sendCount = 0;
        var goneCount = 0;
        var failCount = 0;

        foreach (var userId in adminUserIds)
        {
            var subscriptions = await db.PushSubscriptions
                .IgnoreQueryFilters()  // PushSubscription uses nullable FleetId — may not be filtered
                .AsNoTracking()
                .Where(p => p.UserId == userId)
                .ToListAsync(ct);

            foreach (var sub in subscriptions)
            {
                try
                {
                    var result = await pushSender.SendAsync(sub, message, ct);
                    sendCount++;
                    switch (result.Outcome)
                    {
                        case PushSendOutcome.Gone:
                            goneCount++;
                            break;
                        case PushSendOutcome.Failed:
                            failCount++;
                            break;
                    }
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    // Per-recipient failure: log and continue to remaining recipients
                    logger.LogWarning(ex, "Push failed {FleetId} {IsoWeek} {Reason}",
                        fleetId, isoWeek, "PushException");
                    failCount++;
                }
            }
        }

        // Write marker exactly once, regardless of send outcomes
        db.WeeklyDigestMarkers.Add(new WeeklyDigestMarker
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleetId,
            IsoYear = isoYear,
            IsoWeek = isoWeek,
            SentAt = timeProvider.GetUtcNow()
        });
        await db.SaveChangesAsync(ct);

        logger.LogInformation(
            "Digest sent {FleetId} {IsoYear} {IsoWeek} {SendCount} {GoneCount} {FailCount}",
            fleetId, isoYear, isoWeek, sendCount, goneCount, failCount);
    }

    /// <summary>Aggregates rides, revenue, and avg rating for a fleet over a UTC time window.</summary>
    private static async Task<WeekAgg> AggregateWeekAsync(
        TaxiDbContext db, Guid fleetId,
        DateTimeOffset from, DateTimeOffset to,
        CancellationToken ct)
    {
        var agg = await db.Database.SqlQuery<WeekAggRow>(
            $"""
             SELECT
                 COUNT(*) FILTER (WHERE status = 'Completed')::int                          AS "rides",
                 COALESCE(SUM(final_price_czk) FILTER (WHERE status = 'Completed'), 0)::int AS "revenue_czk",
                 AVG(rating_stars::float8) FILTER (WHERE status = 'Completed' AND rating_stars IS NOT NULL) AS "avg_rating"
             FROM orders
             WHERE fleet_id = {fleetId}
               AND created_at >= {from}
               AND created_at < {to}
             """).SingleAsync(ct);

        return new WeekAgg(agg.Rides, agg.RevenueCzk, agg.AvgRating);
    }

    /// <summary>Returns the first name of the driver with the most completed rides in the week,
    /// or null if no completed rides exist. Only the first name is returned (no full PII).</summary>
    private static async Task<string?> GetTopDriverFirstNameAsync(
        TaxiDbContext db, Guid fleetId,
        DateTimeOffset from, DateTimeOffset to,
        CancellationToken ct)
    {
        var row = await db.Database.SqlQuery<TopDriverRow>(
            $"""
             SELECT u.display_name AS "display_name"
             FROM orders o
             JOIN drivers d ON d.id = o.driver_id
             JOIN users u ON u.id = d.user_id
             WHERE o.fleet_id = {fleetId}
               AND o.status = 'Completed'
               AND o.created_at >= {from}
               AND o.created_at < {to}
               AND o.driver_id IS NOT NULL
             GROUP BY d.id, u.display_name
             ORDER BY COUNT(*) DESC
             LIMIT 1
             """).FirstOrDefaultAsync(ct);

        if (row is null) return null;

        // Return only the first name (split on space, take first token — no full name PII)
        var parts = row.DisplayName.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        return parts.Length > 0 ? parts[0] : row.DisplayName;
    }

    /// <summary>Formats the MoM rides delta as a Czech-style text fragment.</summary>
    private static string ComputeDeltaText(int rides, int priorRides)
    {
        if (priorRides == 0) return rides > 0 ? "+100 %" : "0 %";
        var pct = Math.Round((rides - priorRides) / (double)priorRides * 100.0, 1);
        return pct >= 0
            ? $"+{pct.ToString("F1", CultureInfo.InvariantCulture)} %"
            : $"{pct.ToString("F1", CultureInfo.InvariantCulture)} %";
    }

    /// <summary>Converts a <see cref="DateTime"/> (assumed Prague local) to UTC.</summary>
    private static DateTimeOffset ToUtc(DateTime pragueLocal)
    {
        return new DateTimeOffset(TimeZoneInfo.ConvertTimeToUtc(pragueLocal, PragueZone), TimeSpan.Zero);
    }

    // ── Internal types ────────────────────────────────────────────────────────

    private sealed record WeekAgg(int Rides, int RevenueCzk, double? AvgRating);

    /// <summary>SQL row shape for the weekly aggregation query.</summary>
    private sealed record WeekAggRow(int Rides, int RevenueCzk, double? AvgRating);

    /// <summary>SQL row shape for the top-driver query.</summary>
    private sealed record TopDriverRow(string DisplayName);
}

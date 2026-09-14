using System.Globalization;
using System.Runtime.CompilerServices;
using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Features.Analytics.Shared;
using Taxi.Api.Infrastructure;

namespace Taxi.Api.Features.Analytics.GetDrivers;

/// <summary>Returns the driver league table and retention series for the fleet.
/// League table: rides completed, revenue, online hours, utilization, revenue/online-hour,
/// acceptance rate, avg time-to-accept, declines+timeouts, cancellations, no-shows, avg rating.
/// Retention: per ISO week — active drivers, newly activated (first-ever ride in week),
/// churned (previously active, no completed ride in trailing 14 days ending at week end).
/// compare=true recomputes both sections for the prior equal-length period.
/// All aggregation is SQL-only; driver names fetched in one batch query (no N+1).</summary>
internal sealed class GetDriversEndpoint(TaxiDbContext dbContext, ICurrentTenant currentTenant, TimeProvider timeProvider)
    : Endpoint<AnalyticsRangeRequest, GetDriversResponse>
{
    private readonly AnalyticsFeatureConfiguration _featureConfiguration = new();

    private const int LowRatedThreshold = 3;

    /// <inheritdoc />
    public override void Configure()
    {
        Get("analytics/drivers");
        Description(builder => builder
            .WithName(nameof(GetDriversEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.FleetAdminOnly));

        Summary(s =>
        {
            s.Summary = "Driver league table and retention (FleetAdmin)";
            s.Description =
                "Driver league table with rides, revenue, online hours, utilization %, " +
                "revenue/online-hour, acceptance rate, avg time-to-accept, declines+timeouts, " +
                "cancellations, no-shows, avg rating, sorted by rides completed descending. " +
                "Retention series per ISO week: active, newly activated, churned. " +
                "compare=true recomputes all sections for the prior equal-length period.";
            s.Responses[StatusCodes.Status200OK] = "Driver analytics.";
            s.Responses[StatusCodes.Status400BadRequest] = "Invalid date, range, or granularity.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a fleet admin.";
            s.Responses[StatusCodes.Status404NotFound] = "No fleet resolved for the request.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(AnalyticsRangeRequest req, CancellationToken ct)
    {
        if (currentTenant.FleetId is not Guid fleetId) { await Send.NotFoundAsync(ct); return; }

        var (winStart, winEnd, priorStart, priorEnd) =
            AnalyticsWindow.Resolve(req.From, req.To, req.Compare, timeProvider.GetUtcNow());

        var drivers = await ComputeLeagueAsync(fleetId, winStart, winEnd, ct);
        var retention = await ComputeRetentionAsync(fleetId, winStart, winEnd, ct);

        GetDriversPriorDto? prior = null;
        if (req.Compare && priorStart is not null && priorEnd is not null)
        {
            prior = new GetDriversPriorDto(
                Drivers: await ComputeLeagueAsync(fleetId, priorStart.Value, priorEnd.Value, ct),
                Retention: await ComputeRetentionAsync(fleetId, priorStart.Value, priorEnd.Value, ct));
        }

        await Send.OkAsync(new GetDriversResponse(drivers, retention, prior), ct);
    }

    // ── Driver league table ───────────────────────────────────────────────────
    // One GROUP BY per data source; merged in memory. No per-driver loops (no N+1).

    private async Task<List<DriverLeagueRowDto>> ComputeLeagueAsync(
        Guid fleetId, DateTimeOffset winStart, DateTimeOffset winEnd, CancellationToken ct)
    {
        // 1. Rides metrics from orders (status=Completed, completed_at in window, driver_id not null).
        var ridesRows = await dbContext.Database.SqlQuery<DriverRidesRow>(
            $"""
             SELECT driver_id AS "driverid",
                    COUNT(*)::int                                              AS "rides",
                    COALESCE(SUM(final_price_czk), 0)::int                    AS "revenue",
                    COALESCE(SUM(EXTRACT(EPOCH FROM (completed_at - accepted_at))), 0)::float8 AS "busyseconds",
                    COALESCE(AVG(EXTRACT(EPOCH FROM (accepted_at - assigned_at))) FILTER (WHERE accepted_at IS NOT NULL AND assigned_at IS NOT NULL), 0)::float8 AS "avgtimetoacceptseconds",
                    COALESCE(AVG(rating_stars::float8) FILTER (WHERE rating_stars IS NOT NULL), NULL)::float8 AS "avgrating",
                    COUNT(*) FILTER (WHERE rating_stars IS NOT NULL)::int      AS "ratingcount"
             FROM orders
             WHERE fleet_id = {fleetId}
               AND status = 'Completed'
               AND driver_id IS NOT NULL
               AND completed_at >= {winStart}
               AND completed_at < {winEnd}
             GROUP BY driver_id
             """).ToListAsync(ct);

        // 2. Declined+timeout count: orders assigned to driver but cancelled before acceptance.
        //    driver-declined = Cancelled + assigned_at IS NOT NULL + accepted_at IS NULL.
        var declineRows = await dbContext.Database.SqlQuery<DriverDeclineRow>(
            $"""
             SELECT driver_id AS "driverid",
                    COUNT(*)::int AS "declines"
             FROM orders
             WHERE fleet_id = {fleetId}
               AND driver_id IS NOT NULL
               AND status = 'Cancelled'
               AND assigned_at IS NOT NULL
               AND accepted_at IS NULL
               AND assigned_at >= {winStart}
               AND assigned_at < {winEnd}
             GROUP BY driver_id
             """).ToListAsync(ct);

        // 3. Cancellations after acceptance (accepted, then cancelled): accepted_at IS NOT NULL.
        //    Excludes no-shows (arrived_at IS NOT NULL) to avoid double-counting.
        var cancelRows = await dbContext.Database.SqlQuery<DriverCancelRow>(
            $"""
             SELECT driver_id AS "driverid",
                    COUNT(*)::int AS "cancellations",
                    COUNT(*) FILTER (WHERE arrived_at IS NOT NULL)::int AS "noshows"
             FROM orders
             WHERE fleet_id = {fleetId}
               AND driver_id IS NOT NULL
               AND status = 'Cancelled'
               AND accepted_at IS NOT NULL
               AND cancelled_at >= {winStart}
               AND cancelled_at < {winEnd}
             GROUP BY driver_id
             """).ToListAsync(ct);

        // 4. Online hours from driver_shifts (clamped to window boundaries).
        var shiftRows = await dbContext.Database.SqlQuery<DriverShiftRow>(
            $"""
             SELECT driver_id AS "driverid",
                    SUM(EXTRACT(EPOCH FROM (
                        LEAST(COALESCE(ended_at, {winEnd}), {winEnd})
                        - GREATEST(started_at, {winStart})
                    )))::float8 AS "onlineseconds"
             FROM driver_shifts
             WHERE fleet_id = {fleetId}
               AND started_at < {winEnd}
               AND (ended_at IS NULL OR ended_at > {winStart})
             GROUP BY driver_id
             """).ToListAsync(ct);

        // 5. Load all fleet drivers in one batch (includes drivers with zero activity).
        //    EF global query filter ensures fleetId isolation.
        var allDrivers = await dbContext.Drivers.AsNoTracking()
            .Where(d => d.FleetId == fleetId && d.IsActive)
            .Join(dbContext.Users.AsNoTracking(),
                d => d.UserId,
                u => u.Id,
                (d, u) => new { d.Id, u.DisplayName })
            .ToListAsync(ct);

        if (allDrivers.Count == 0) return [];

        var nameMap = allDrivers.ToDictionary(x => x.Id, x => x.DisplayName);
        var allDriverIds = allDrivers.Select(x => x.Id).ToList();

        // 6. Merge in memory.
        var declineMap = declineRows.ToDictionary(r => r.Driverid, r => r.Declines);
        var cancelMap = cancelRows.ToDictionary(r => r.Driverid, r => r);
        var shiftMap = shiftRows.ToDictionary(r => r.Driverid, r => r.Onlineseconds);

        // Build league rows for every driver that appears in any data source.
        var rows = new List<DriverLeagueRowDto>(allDriverIds.Count);
        foreach (var dId in allDriverIds)
        {
            var name = nameMap.GetValueOrDefault(dId, "Unknown");
            var ride = ridesRows.FirstOrDefault(r => r.Driverid == dId);
            var declines = declineMap.GetValueOrDefault(dId, 0);
            var cancel = cancelMap.GetValueOrDefault(dId);
            var onlineSeconds = shiftMap.GetValueOrDefault(dId, 0.0);

            var ridesCompleted = ride?.Rides ?? 0;
            var revenue = ride?.Revenue ?? 0;
            var busySeconds = ride?.Busyseconds ?? 0.0;
            var avgTimeToAccept = ride?.Avgtimetoacceptseconds ?? 0.0;
            var avgRating = ride?.Avgrating;
            var onlineHours = onlineSeconds / 3600.0;
            var utilizationPct = onlineSeconds > 0 ? busySeconds / onlineSeconds * 100.0 : 0.0;
            var revenuePerHour = onlineHours > 0 ? revenue / onlineHours : 0.0;

            // Acceptance rate: accepted rides / (accepted + declined+timeout) × 100.
            var totalOffered = ridesCompleted + declines;
            var acceptanceRate = totalOffered > 0 ? ridesCompleted * 100.0 / totalOffered : 0.0;

            var cancellations = cancel?.Cancellations ?? 0;
            var noShows = cancel?.Noshows ?? 0;

            rows.Add(new DriverLeagueRowDto(
                DriverId: dId,
                Name: name,
                RidesCompleted: ridesCompleted,
                RevenueCzk: revenue,
                OnlineHours: onlineHours,
                UtilizationPct: utilizationPct,
                RevenuePerOnlineHour: revenuePerHour,
                AcceptanceRate: acceptanceRate,
                AvgTimeToAcceptSeconds: avgTimeToAccept,
                DeclinesAndTimeouts: declines,
                Cancellations: cancellations,
                NoShows: noShows,
                AvgRating: avgRating));
        }

        return rows.OrderByDescending(r => r.RidesCompleted).ThenBy(r => r.Name).ToList();
    }

    // ── Driver retention series (per ISO week) ────────────────────────────────
    // Active = ≥1 completed ride in week.
    // NewlyActivated = first-ever completed ride is in this week (all-time, not just window).
    // Churned = had ≥1 completed ride before this week, AND no completed ride in trailing 14 days
    //           ending at week_end. This requires looking at all-time history, not just the window.

    private async Task<List<RetentionBucketDto>> ComputeRetentionAsync(
        Guid fleetId, DateTimeOffset winStart, DateTimeOffset winEnd, CancellationToken ct)
    {
        // Generate ISO week boundaries (Monday-based) within the window.
        // Each week = [weekStart, weekEnd) where weekEnd = weekStart + 7 days.
        var weeks = GenerateIsoWeeks(winStart, winEnd);
        if (weeks.Count == 0) return [];

        var result = new List<RetentionBucketDto>(weeks.Count);
        foreach (var (weekStart, weekEnd) in weeks)
        {
            // Active: drivers with ≥1 completed ride in [weekStart, weekEnd).
            var active = await dbContext.Database.SqlQuery<CountRow>(
                $"""
                 SELECT COUNT(DISTINCT driver_id)::int AS "count"
                 FROM orders
                 WHERE fleet_id = {fleetId}
                   AND status = 'Completed'
                   AND driver_id IS NOT NULL
                   AND completed_at >= {weekStart}
                   AND completed_at < {weekEnd}
                 """).SingleAsync(ct);

            // NewlyActivated: drivers whose first-ever completed ride is in [weekStart, weekEnd).
            // Counts all-time first rides, not limited to the window.
            var newlyActivated = await dbContext.Database.SqlQuery<CountRow>(
                $"""
                 SELECT COUNT(DISTINCT driver_id)::int AS "count"
                 FROM (
                     SELECT driver_id,
                            MIN(completed_at) AS first_ride
                     FROM orders
                     WHERE fleet_id = {fleetId}
                       AND status = 'Completed'
                       AND driver_id IS NOT NULL
                     GROUP BY driver_id
                 ) AS first_rides
                 WHERE first_ride >= {weekStart}
                   AND first_ride < {weekEnd}
                 """).SingleAsync(ct);

            // Churned: had ≥1 completed ride before weekStart, AND no completed ride
            // in the trailing 14 days window ending at weekEnd (i.e., [weekEnd-14days, weekEnd)).
            // A driver is churned in this week if their most recent completed ride before weekEnd
            // is older than 14 days (i.e., before weekEnd - 14 days).
            var churnCutoff = weekEnd.AddDays(-14);
            var churned = await dbContext.Database.SqlQuery<CountRow>(
                $"""
                 SELECT COUNT(DISTINCT driver_id)::int AS "count"
                 FROM (
                     SELECT driver_id,
                            MAX(completed_at) AS last_ride
                     FROM orders
                     WHERE fleet_id = {fleetId}
                       AND status = 'Completed'
                       AND driver_id IS NOT NULL
                       AND completed_at < {weekEnd}
                     GROUP BY driver_id
                 ) AS last_rides
                 WHERE last_ride < {churnCutoff}
                 """).SingleAsync(ct);

            result.Add(new RetentionBucketDto(
                WeekStart: weekStart.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                Active: active.Count,
                NewlyActivated: newlyActivated.Count,
                Churned: churned.Count));
        }

        return result;
    }

    /// <summary>Generates ISO week (Monday-based) start/end pairs that overlap the given window.</summary>
    private static List<(DateTimeOffset Start, DateTimeOffset End)> GenerateIsoWeeks(
        DateTimeOffset winStart, DateTimeOffset winEnd)
    {
        var weeks = new List<(DateTimeOffset, DateTimeOffset)>();

        // Find the Monday of the first week that overlaps winStart.
        var current = winStart;
        // Align to ISO Monday (DayOfWeek: Mon=1, but .NET Sunday=0, Mon=1,...Sat=6).
        var dayOffset = ((int)current.DayOfWeek + 6) % 7; // 0=Mon, 1=Tue, ..., 6=Sun
        var firstMonday = current.AddDays(-dayOffset).Date;
        var weekStart = new DateTimeOffset(firstMonday, TimeSpan.Zero);

        while (weekStart < winEnd)
        {
            var weekEnd = weekStart.AddDays(7);
            weeks.Add((weekStart, weekEnd));
            weekStart = weekEnd;
        }

        return weeks;
    }

    // ── Internal SQL row types ────────────────────────────────────────────────

    /// <summary>Row shape for rides/revenue/busy-seconds/time-to-accept/rating aggregates.</summary>
    private sealed record DriverRidesRow(
        Guid Driverid,
        int Rides,
        int Revenue,
        double Busyseconds,
        double Avgtimetoacceptseconds,
        double? Avgrating,
        int Ratingcount);

    /// <summary>Row shape for declined/timed-out offer counts.</summary>
    private sealed record DriverDeclineRow(Guid Driverid, int Declines);

    /// <summary>Row shape for post-acceptance cancellations and no-shows.</summary>
    private sealed record DriverCancelRow(Guid Driverid, int Cancellations, int Noshows);

    /// <summary>Row shape for online seconds from driver_shifts.</summary>
    private sealed record DriverShiftRow(Guid Driverid, double Onlineseconds);

    /// <summary>Row shape for a simple COUNT aggregate.</summary>
    private sealed record CountRow(int Count);
}

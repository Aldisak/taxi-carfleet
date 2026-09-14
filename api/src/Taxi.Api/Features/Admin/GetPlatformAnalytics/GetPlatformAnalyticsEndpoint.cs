using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Features.Admin.GetPlatformAnalytics;

/// <summary>Returns cross-tenant platform analytics: per-fleet rides + revenue this month and last month
/// (Prague local), MoM delta, active drivers/customers, SMS cost, last order timestamp, 12-week rides
/// sparkline, and a rule-based health flag. SuperAdminOnly.
/// <para><b>IgnoreQueryFilters()</b> is intentional — this is a cross-tenant SuperAdmin view.</para></summary>
internal sealed class GetPlatformAnalyticsEndpoint(TaxiDbContext dbContext, TimeProvider timeProvider)
    : EndpointWithoutRequest<GetPlatformAnalyticsResponse>
{
    private static readonly TimeZoneInfo PragueZone =
        TimeZoneInfo.FindSystemTimeZoneById("Europe/Prague");

    private readonly AdminFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Get("admin/analytics");
        Description(builder => builder.WithName(nameof(GetPlatformAnalyticsEndpoint)).WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.SuperAdminOnly));

        Summary(s =>
        {
            s.Summary = "Platform analytics (SuperAdmin)";
            s.Description = "Cross-tenant per-fleet table: rides + revenue this month and last (Prague), " +
                            "MoM delta, active drivers/customers, SMS count + estimated cost, last order " +
                            "timestamp, 12-week rides sparkline, and a health flag " +
                            "(growing/stable/declining/inactive). Platform totals row.";
            s.Responses[StatusCodes.Status200OK] = "Platform analytics.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a SuperAdmin.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(CancellationToken ct)
    {
        var now = timeProvider.GetUtcNow();
        var pragueNow = TimeZoneInfo.ConvertTime(now, PragueZone);

        // Current month boundaries in Prague local → UTC
        var thisMonthStart = ToUtc(new DateOnly(pragueNow.Year, pragueNow.Month, 1));
        var thisMonthEnd = ToUtc(new DateOnly(pragueNow.Year, pragueNow.Month, 1).AddMonths(1));

        // Previous month boundaries
        var lastMonthStart = thisMonthStart.AddMonths(-1);
        // Ensure lastMonthStart is start of that month in Prague
        var lastMonthPrague = TimeZoneInfo.ConvertTime(thisMonthStart.AddSeconds(-1), PragueZone);
        lastMonthStart = ToUtc(new DateOnly(lastMonthPrague.Year, lastMonthPrague.Month, 1));
        var lastMonthEnd = thisMonthStart; // last month ends where this month starts

        // 14-day inactivity cutoff
        var inactiveCutoff = now.AddDays(-14);

        // 12-week sparkline: 12 ISO weeks ending with the week prior to the current week's start.
        // Use Prague-local DateOnly Mondays to stay consistent with the SQL date_trunc 'week' ::date output.
        var currentWeekMonday = GetPragueWeekMonday(pragueNow);
        var sparklineEnd = ToUtc(currentWeekMonday);
        var sparklineStart = sparklineEnd.AddDays(-84); // 12 × 7
        var sparklineStartMonday = currentWeekMonday.AddDays(-84); // Prague-local DateOnly for BuildSparkline

        // Load all active fleets (IgnoreQueryFilters: cross-tenant SuperAdmin view)
        var fleets = await dbContext.Fleets
            .IgnoreQueryFilters()  // cross-tenant: intentional SuperAdmin read
            .AsNoTracking()
            .Where(f => f.IsActive)
            .Select(f => new { f.Id, f.Name })
            .ToListAsync(ct);

        var rows = new List<FleetHealthRowDto>(fleets.Count);

        foreach (var fleet in fleets)
        {
            var row = await BuildFleetRowAsync(
                fleet.Id, fleet.Name,
                thisMonthStart, thisMonthEnd,
                lastMonthStart, lastMonthEnd,
                inactiveCutoff,
                sparklineStart, sparklineEnd, sparklineStartMonday,
                ct);
            rows.Add(row);
        }

        var totals = new PlatformTotalsDto(
            TotalFleets: rows.Count,
            TotalRidesThisMonth: rows.Sum(r => r.RidesThisMonth),
            TotalRevenueThisMonthCzk: rows.Sum(r => r.RevenueThisMonthCzk),
            GrowingFleets: rows.Count(r => r.Health == "growing"),
            DecliningFleets: rows.Count(r => r.Health == "declining"),
            InactiveFleets: rows.Count(r => r.Health == "inactive"));

        await Send.OkAsync(new GetPlatformAnalyticsResponse(rows, totals), ct);
    }

    /// <summary>Builds a single fleet's analytics row using cross-tenant SQL queries.
    /// <b>IgnoreQueryFilters()</b> on each query is intentional: this endpoint is SuperAdminOnly
    /// and must see all fleets' data regardless of the tenant filter.</summary>
    private async Task<FleetHealthRowDto> BuildFleetRowAsync(
        Guid fleetId, string fleetName,
        DateTimeOffset thisMonthStart, DateTimeOffset thisMonthEnd,
        DateTimeOffset lastMonthStart, DateTimeOffset lastMonthEnd,
        DateTimeOffset inactiveCutoff,
        DateTimeOffset sparklineStart, DateTimeOffset sparklineEnd, DateOnly sparklineStartMonday,
        CancellationToken ct)
    {
        // Aggregate: this month
        var thisMonth = await dbContext.Database.SqlQuery<MonthAggRow>(
            $"""
             SELECT
                 COUNT(*) FILTER (WHERE status = 'Completed')::int                          AS "rides",
                 COALESCE(SUM(final_price_czk) FILTER (WHERE status = 'Completed'), 0)::int AS "revenue_czk",
                 COUNT(DISTINCT CASE WHEN status = 'Completed' THEN driver_id END)::int     AS "active_drivers",
                 COUNT(DISTINCT CASE WHEN status = 'Completed' THEN customer_user_id END)::int AS "active_customers",
                 MAX(created_at)                                                              AS "last_order_at"
             FROM orders
             WHERE fleet_id = {fleetId}
               AND created_at >= {thisMonthStart}
               AND created_at < {thisMonthEnd}
             """).SingleAsync(ct);

        // Aggregate: last month
        var lastMonth = await dbContext.Database.SqlQuery<MonthRidesRow>(
            $"""
             SELECT
                 COUNT(*) FILTER (WHERE status = 'Completed')::int                          AS "rides",
                 COALESCE(SUM(final_price_czk) FILTER (WHERE status = 'Completed'), 0)::int AS "revenue_czk"
             FROM orders
             WHERE fleet_id = {fleetId}
               AND created_at >= {lastMonthStart}
               AND created_at < {lastMonthEnd}
             """).SingleAsync(ct);

        // SMS count this month (IgnoreQueryFilters: cross-tenant SuperAdmin view)
        var smsCount = await dbContext.NotificationLog
            .IgnoreQueryFilters()  // cross-tenant: intentional SuperAdmin read
            .AsNoTracking()
            .CountAsync(n => n.FleetId == fleetId
                          && n.Channel == NotificationChannel.Sms
                          && n.CreatedAt >= thisMonthStart
                          && n.CreatedAt < thisMonthEnd, ct);

        // SMS unit cost from FleetSettings (default 1 when no row; (int?) cast prevents 0-default trap).
        // IgnoreQueryFilters: cross-tenant SuperAdmin endpoint has no tenant JWT claim.
        var smsUnitCost = await dbContext.FleetSettings
            .IgnoreQueryFilters()  // cross-tenant: intentional SuperAdmin read
            .AsNoTracking()
            .Where(fs => fs.FleetId == fleetId)
            .Select(fs => (int?)fs.SmsUnitCostCzk)
            .FirstOrDefaultAsync(ct) ?? 1;

        // Last order overall (any status) — for inactivity check
        // Use the MAX from thisMonth agg; if null, check lastMonth period and beyond
        var lastOrderAt = thisMonth.LastOrderAt;
        if (lastOrderAt is null)
        {
            lastOrderAt = await dbContext.Database.SqlQuery<NullableDateRow>(
                $"""
                 SELECT MAX(created_at) AS "last_at"
                 FROM orders
                 WHERE fleet_id = {fleetId}
                 """).Select(r => r.LastAt).SingleOrDefaultAsync(ct);
        }

        // 12-week sparkline: completed rides per ISO week (oldest first, 12 weeks)
        // Load all rows in the 12-week window then map in memory
        // (JsonDocument projection trap: avoid projecting complex EF-untranslatable expressions)
        var sparklineRows = await dbContext.Database.SqlQuery<SparklineRow>(
            $"""
             SELECT
                 date_trunc('week', created_at AT TIME ZONE 'Europe/Prague')::date AS "week_start",
                 COUNT(*) FILTER (WHERE status = 'Completed')::int                  AS "rides"
             FROM orders
             WHERE fleet_id = {fleetId}
               AND created_at >= {sparklineStart}
               AND created_at < {sparklineEnd}
             GROUP BY date_trunc('week', created_at AT TIME ZONE 'Europe/Prague')::date
             ORDER BY 1
             """).ToListAsync(ct);

        // Build 12-slot array (fill gaps with 0).
        // Pass the Prague-local Monday DateOnly cursor to avoid UTC-offset key mismatches.
        var sparkline = BuildSparkline(sparklineRows, sparklineStartMonday);

        // Health flag: check inactive first (no order in 14 days takes priority)
        var health = ComputeHealth(
            ridesThisMonth: thisMonth.Rides,
            ridesLastMonth: lastMonth.Rides,
            lastOrderAt: lastOrderAt,
            inactiveCutoff: inactiveCutoff);

        // MoM delta %: if lastMonth = 0 and thisMonth > 0 → treat as +100% (growing)
        // if both = 0 → 0%
        var momDelta = ComputeMomDelta(thisMonth.Rides, lastMonth.Rides);

        return new FleetHealthRowDto(
            FleetId: fleetId,
            FleetName: fleetName,
            RidesThisMonth: thisMonth.Rides,
            RidesLastMonth: lastMonth.Rides,
            RevenueThisMonthCzk: thisMonth.RevenueCzk,
            RevenueLastMonthCzk: lastMonth.RevenueCzk,
            MomDeltaPct: momDelta,
            ActiveDrivers: thisMonth.ActiveDrivers,
            ActiveCustomers: thisMonth.ActiveCustomers,
            SmsCount: smsCount,
            SmsEstimatedCostCzk: smsCount * smsUnitCost,
            LastOrderAt: lastOrderAt,
            SparklineWeeks: sparkline,
            Health: health);
    }

    /// <summary>Computes the health flag. Inactive takes precedence over MoM percentages.</summary>
    private static string ComputeHealth(
        int ridesThisMonth, int ridesLastMonth,
        DateTimeOffset? lastOrderAt, DateTimeOffset inactiveCutoff)
    {
        // inactive: no order at all in the past 14 days (based on most recent order timestamp)
        if (lastOrderAt is null || lastOrderAt < inactiveCutoff)
            return "inactive";

        var momDelta = ComputeMomDelta(ridesThisMonth, ridesLastMonth);

        return momDelta switch
        {
            >= 10.0 => "growing",
            <= -10.0 => "declining",
            _ => "stable"
        };
    }

    /// <summary>Computes the MoM rides delta as a percentage.
    /// 0→N = +100% (positive growth); 0→0 = 0%; N→0 where N &gt; 0 = −100%.</summary>
    private static double ComputeMomDelta(int ridesThisMonth, int ridesLastMonth)
    {
        if (ridesLastMonth == 0 && ridesThisMonth == 0) return 0.0;
        if (ridesLastMonth == 0) return 100.0; // any positive growth from zero → 100%
        return Math.Round((ridesThisMonth - ridesLastMonth) / (double)ridesLastMonth * 100.0, 1);
    }

    /// <summary>Builds a 12-slot sparkline (oldest first) filling gaps with 0.
    /// The SQL keys are Prague-local calendar dates (date_trunc 'week' → ::date), so both sides
    /// are compared as <see cref="DateOnly"/> to avoid UTC-offset mismatches.</summary>
    private static List<int> BuildSparkline(
        List<SparklineRow> rows, DateOnly sparklineStartPragueMonday)
    {
        // SparklineRow.WeekStart is a Postgres ::date projected as DateTime at 00:00 local.
        // Treat it as a calendar date (DateOnly) — no timezone conversion needed.
        var byWeek = rows.ToDictionary(r => DateOnly.FromDateTime(r.WeekStart), r => r.Rides);
        var result = new List<int>(12);

        var weekCursor = sparklineStartPragueMonday;
        for (var i = 0; i < 12; i++)
        {
            result.Add(byWeek.TryGetValue(weekCursor, out var rides) ? rides : 0);
            weekCursor = weekCursor.AddDays(7);
        }

        return result;
    }

    /// <summary>Returns the Prague-local Monday for the ISO week containing the given instant.</summary>
    private static DateOnly GetPragueWeekMonday(DateTimeOffset pragueNow)
    {
        var date = DateOnly.FromDateTime(pragueNow.DateTime);
        // DayOfWeek: Sunday=0, Monday=1, ... Saturday=6
        var dayOfWeek = (int)pragueNow.DayOfWeek;
        // ISO week Monday: subtract (dayOfWeek - 1) % 7 days from the date
        var daysBack = dayOfWeek == 0 ? 6 : dayOfWeek - 1;
        return date.AddDays(-daysBack);
    }

    /// <summary>Converts a Prague-local date to the corresponding UTC DateTimeOffset.</summary>
    private static DateTimeOffset ToUtc(DateOnly pragueDay)
    {
        var local = pragueDay.ToDateTime(TimeOnly.MinValue);
        return new DateTimeOffset(TimeZoneInfo.ConvertTimeToUtc(local, PragueZone), TimeSpan.Zero);
    }

    // ── SQL row types ─────────────────────────────────────────────────────────

    /// <summary>Aggregated row for the current month analytics query.</summary>
    private sealed record MonthAggRow(
        int Rides,
        int RevenueCzk,
        int ActiveDrivers,
        int ActiveCustomers,
        DateTimeOffset? LastOrderAt);

    /// <summary>Row for the prior month rides + revenue query.</summary>
    private sealed record MonthRidesRow(int Rides, int RevenueCzk);

    /// <summary>Row for sparkline week-by-week query.</summary>
    private sealed record SparklineRow(DateTime WeekStart, int Rides);

    /// <summary>Row for nullable date scalar query.</summary>
    private sealed record NullableDateRow(DateTimeOffset? LastAt);
}

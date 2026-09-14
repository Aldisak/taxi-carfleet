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

namespace Taxi.Api.Features.Analytics.GetOverview;

/// <summary>Returns KPI cards, optional prior-period deltas, and a rides+revenue trend series for the
/// fleet's analytics overview. FleetAdmin only, tenant-scoped. All aggregation is computed in SQL —
/// no in-memory grouping of raw order rows.</summary>
internal sealed class GetOverviewEndpoint(TaxiDbContext dbContext, ICurrentTenant currentTenant, TimeProvider timeProvider)
    : Endpoint<AnalyticsRangeRequest, GetOverviewResponse>
{
    private readonly AnalyticsFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Get("analytics/overview");
        Description(builder => builder
            .WithName(nameof(GetOverviewEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.FleetAdminOnly));

        Summary(s =>
        {
            s.Summary = "Analytics overview (FleetAdmin)";
            s.Description = "KPI cards (rides, revenue, AOV, fulfillment/cancellation rate, active customers/drivers, " +
                            "online hours, revenue per hour, avg rating) with optional prior-period deltas (compare=true) " +
                            "and a compact rides+revenue trend series. SQL-aggregated.";
            s.Responses[StatusCodes.Status200OK] = "Analytics overview.";
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

        var truncUnit = AnalyticsWindow.TruncUnit(req.Granularity);

        var current = await ComputeKpisAsync(fleetId, winStart, winEnd, ct);
        var series = await ComputeSeriesAsync(fleetId, winStart, winEnd, truncUnit, ct);

        OverviewKpiDto? prior = null;
        OverviewDeltaDto? deltas = null;

        if (req.Compare && priorStart is not null && priorEnd is not null)
        {
            prior = await ComputeKpisAsync(fleetId, priorStart.Value, priorEnd.Value, ct);
            deltas = new OverviewDeltaDto(
                Rides: current.Rides - prior.Rides,
                RevenueCzk: current.RevenueCzk - prior.RevenueCzk,
                Aov: current.Aov - prior.Aov,
                FulfillmentRate: Math.Round(current.FulfillmentRate - prior.FulfillmentRate, 4),
                CancellationRate: Math.Round(current.CancellationRate - prior.CancellationRate, 4),
                ActiveCustomers: current.ActiveCustomers - prior.ActiveCustomers,
                NewCustomers: current.NewCustomers - prior.NewCustomers,
                ActiveDrivers: current.ActiveDrivers - prior.ActiveDrivers,
                OnlineDriverHours: Math.Round(current.OnlineDriverHours - prior.OnlineDriverHours, 4),
                RevenuePerOnlineHour: Math.Round(current.RevenuePerOnlineHour - prior.RevenuePerOnlineHour, 2),
                AvgRating: current.AvgRating.HasValue && prior.AvgRating.HasValue
                    ? Math.Round(current.AvgRating.Value - prior.AvgRating.Value, 2)
                    : null);
        }

        await Send.OkAsync(new GetOverviewResponse(current, prior, deltas, series), ct);
    }

    private async Task<OverviewKpiDto> ComputeKpisAsync(
        Guid fleetId, DateTimeOffset winStart, DateTimeOffset winEnd, CancellationToken ct)
    {
        var agg = await dbContext.Database.SqlQuery<OverviewKpiRow>(
            $"""
             SELECT
                 COUNT(*) FILTER (WHERE status = 'Completed')::int                            AS "rides",
                 COALESCE(SUM(final_price_czk) FILTER (WHERE status = 'Completed'), 0)::int   AS "revenue_czk",
                 COALESCE(ROUND(AVG(final_price_czk) FILTER (WHERE status = 'Completed')), 0)::int AS "aov",
                 CASE WHEN COUNT(*) = 0 THEN 0.0
                      ELSE COUNT(*) FILTER (WHERE status = 'Completed')::float8 / COUNT(*) END AS "fulfillment_rate",
                 CASE WHEN COUNT(*) = 0 THEN 0.0
                      ELSE COUNT(*) FILTER (WHERE status = 'Cancelled')::float8 / COUNT(*) END AS "cancellation_rate",
                 COUNT(DISTINCT CASE WHEN status = 'Completed' THEN customer_user_id END)::int AS "active_customers",
                 COUNT(DISTINCT CASE WHEN status = 'Completed' THEN driver_id END)::int              AS "active_drivers",
                 AVG(rating_stars::float8) FILTER (WHERE status = 'Completed' AND rating_stars IS NOT NULL)                AS "avg_rating"
             FROM orders
             WHERE fleet_id = {fleetId}
               AND created_at >= {winStart}
               AND created_at < {winEnd}
             """).SingleAsync(ct);

        // New customers: customers with exactly one completed order in this period.
        var newCustomers = await dbContext.Database.SqlQuery<CountRow>(
            $"""
             SELECT COUNT(*)::int AS "total"
             FROM (
                 SELECT customer_user_id
                 FROM orders
                 WHERE fleet_id = {fleetId}
                   AND created_at >= {winStart}
                   AND created_at < {winEnd}
                   AND status = 'Completed'
                   AND customer_user_id IS NOT NULL
                 GROUP BY customer_user_id
                 HAVING COUNT(*) = 1
             ) sub
             """).SingleAsync(ct);

        // Online driver-hours: sum of closed shift durations clamped to the window.
        // Only closed shifts (ended_at IS NOT NULL) are included to avoid counting open shifts as running forever.
        var hoursRow = await dbContext.Database.SqlQuery<DriverHoursRow>(
            $"""
             SELECT COALESCE(SUM(
                 EXTRACT(EPOCH FROM (
                     LEAST(ended_at, {winEnd}) - GREATEST(started_at, {winStart})
                 ))
             ) FILTER (
                 WHERE ended_at IS NOT NULL
                   AND started_at < {winEnd}
                   AND ended_at > {winStart}
             ), 0)::float8 / 3600.0 AS "hours"
             FROM driver_shifts
             WHERE fleet_id = {fleetId}
             """).SingleAsync(ct);

        var onlineHours = Math.Round(hoursRow.Hours, 4);
        var revenuePerHour = onlineHours > 0 ? Math.Round(agg.RevenueCzk / onlineHours, 2) : 0.0;

        return new OverviewKpiDto(
            Rides: agg.Rides,
            RevenueCzk: agg.RevenueCzk,
            Aov: agg.Aov,
            FulfillmentRate: Math.Round(agg.FulfillmentRate, 4),
            CancellationRate: Math.Round(agg.CancellationRate, 4),
            ActiveCustomers: agg.ActiveCustomers,
            NewCustomers: newCustomers.Total,
            ActiveDrivers: agg.ActiveDrivers,
            OnlineDriverHours: onlineHours,
            RevenuePerOnlineHour: revenuePerHour,
            AvgRating: agg.AvgRating.HasValue ? Math.Round(agg.AvgRating.Value, 2) : null);
    }

    private async Task<List<TrendBucketDto>> ComputeSeriesAsync(
        Guid fleetId, DateTimeOffset winStart, DateTimeOffset winEnd, string truncUnit, CancellationToken ct)
    {
        // date_trunc requires a string literal for the unit — it cannot accept a SQL parameter ($1).
        // truncUnit is validated by AnalyticsRangeValidator to "day"|"week"|"month" only; safe to embed.
        var sql =
            $"SELECT date_trunc('{truncUnit}', created_at AT TIME ZONE 'Europe/Prague')::date AS \"bucket\"," +
            $" COUNT(*) FILTER (WHERE status = 'Completed')::int AS \"rides\"," +
            $" COALESCE(SUM(final_price_czk) FILTER (WHERE status = 'Completed'), 0)::int AS \"revenue_czk\"" +
            " FROM orders" +
            " WHERE fleet_id = {0}" +
            " AND created_at >= {1}" +
            " AND created_at < {2}" +
            $" GROUP BY date_trunc('{truncUnit}', created_at AT TIME ZONE 'Europe/Prague')::date" +
            " ORDER BY 1";

        var rows = await dbContext.Database
            .SqlQuery<TrendRow>(FormattableStringFactory.Create(sql, fleetId, winStart, winEnd))
            .ToListAsync(ct);

        return rows
            .Select(r => new TrendBucketDto(
                Bucket: r.Bucket.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                Rides: r.Rides,
                RevenueCzk: r.RevenueCzk))
            .ToList();
    }

    // ── Internal SQL row types ────────────────────────────────────────────────

    /// <summary>Row shape for the primary KPI aggregate query.</summary>
    private sealed record OverviewKpiRow(
        int Rides,
        int RevenueCzk,
        int Aov,
        double FulfillmentRate,
        double CancellationRate,
        int ActiveCustomers,
        int ActiveDrivers,
        double? AvgRating);

    /// <summary>Row shape for a single scalar COUNT query (alias "total" → property Total).</summary>
    private sealed record CountRow(int Total);

    /// <summary>Row shape for the online driver-hours query.</summary>
    private sealed record DriverHoursRow(double Hours);

    /// <summary>Row shape for the trend series query.</summary>
    private sealed record TrendRow(DateTime Bucket, int Rides, int RevenueCzk);
}

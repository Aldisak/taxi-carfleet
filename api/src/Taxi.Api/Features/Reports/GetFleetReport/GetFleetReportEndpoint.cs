using System.Globalization;
using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Features.Reports.GetFleetReport;

/// <summary>Returns fleet-wide KPIs, a rides-per-Prague-day series, and top common routes for a date
/// range. FleetAdmin only, tenant-scoped. All aggregation is computed in SQL (conditional COUNT/SUM/AVG
/// and a Prague-local day GROUP BY) — there is no ToList-then-group of raw order rows (AC#2). Backed by
/// the A1 (FleetId, CreatedAt) / (FleetId, Status, CreatedAt) indexes so it stays &lt;300 ms at 50k rows.</summary>
internal sealed class GetFleetReportEndpoint(TaxiDbContext dbContext, ICurrentTenant currentTenant)
    : Endpoint<GetFleetReportRequest, GetFleetReportResponse>
{
    private static readonly TimeZoneInfo PragueZone = TimeZoneInfo.FindSystemTimeZoneById("Europe/Prague");

    private const int TopRoutesLimit = 10;

    private readonly ReportsFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Get("reports/fleet");
        Description(builder => builder
            .WithName(nameof(GetFleetReportEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.FleetAdminOnly));

        Summary(s =>
        {
            s.Summary = "Fleet report (FleetAdmin)";
            s.Description = "Headline KPIs (rides, revenue, avg price, time-to-assign/pickup, cancellation " +
                            "rate, app-vs-phone share, fixed-route share, SMS count + est cost), a " +
                            "rides-per-Prague-day series, and top routes by count — all computed in SQL.";
            s.Responses[StatusCodes.Status200OK] = "Fleet report.";
            s.Responses[StatusCodes.Status400BadRequest] = "Invalid date or range.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a fleet admin.";
            s.Responses[StatusCodes.Status404NotFound] = "No fleet resolved for the request.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(GetFleetReportRequest req, CancellationToken ct)
    {
        if (currentTenant.FleetId is not Guid fleetId) { await Send.NotFoundAsync(ct); return; }

        var fromDate = DateOnly.ParseExact(req.From!, "yyyy-MM-dd", CultureInfo.InvariantCulture);
        var toDate = DateOnly.ParseExact(req.To!, "yyyy-MM-dd", CultureInfo.InvariantCulture);
        var winStart = ToUtc(fromDate);
        var winEnd = ToUtc(toDate.AddDays(1));

        var kpis = await ComputeKpisAsync(fleetId, winStart, winEnd, ct);
        var ridesPerDay = await ComputeRidesPerDayAsync(fleetId, winStart, winEnd, ct);
        var topRoutes = await ComputeTopRoutesAsync(winStart, winEnd, ct);

        await Send.OkAsync(new GetFleetReportResponse(kpis, ridesPerDay, topRoutes), ct);
    }

    private async Task<FleetKpiDto> ComputeKpisAsync(
        Guid fleetId, DateTimeOffset winStart, DateTimeOffset winEnd, CancellationToken ct)
    {
        // One server-side aggregation over orders. extract(epoch from ...) yields seconds for the
        // time-to-assign / time-to-pickup averages. SMS count is a correlated subquery over the log.
        var agg = await dbContext.Database.SqlQuery<FleetKpiRow>(
            $"""
             SELECT
                 COUNT(*) FILTER (WHERE status = 'Completed')::int AS "rides",
                 COALESCE(SUM(final_price_czk) FILTER (WHERE status = 'Completed'), 0)::int AS "revenue_czk",
                 COALESCE(ROUND(AVG(final_price_czk) FILTER (WHERE status = 'Completed')), 0)::int AS "avg_price_czk",
                 AVG(EXTRACT(EPOCH FROM (assigned_at - created_at))) FILTER (WHERE assigned_at IS NOT NULL) AS "avg_time_to_assign_seconds",
                 AVG(EXTRACT(EPOCH FROM (arrived_at - accepted_at))) FILTER (WHERE arrived_at IS NOT NULL AND accepted_at IS NOT NULL) AS "avg_time_to_pickup_seconds",
                 CASE WHEN COUNT(*) = 0 THEN 0
                      ELSE COUNT(*) FILTER (WHERE status = 'Cancelled')::float8 / COUNT(*) END AS "cancellation_rate",
                 COUNT(*) FILTER (WHERE source = 'App')::int AS "app_orders",
                 COUNT(*) FILTER (WHERE source IN ('Phone','Dispatcher'))::int AS "phone_orders",
                 COUNT(*) FILTER (WHERE route_id IS NOT NULL)::int AS "fixed_route_orders"
             FROM orders
             WHERE fleet_id = {fleetId} AND created_at >= {winStart} AND created_at < {winEnd}
             """).SingleAsync(ct);

        var smsCount = await dbContext.NotificationLog.AsNoTracking()
            .Where(n => n.Channel == NotificationChannel.Sms
                     && n.CreatedAt >= winStart && n.CreatedAt < winEnd)
            .CountAsync(ct);

        var smsUnitCost = await dbContext.FleetSettings.AsNoTracking()
            .Where(fs => fs.FleetId == fleetId)
            .Select(fs => (int?)fs.SmsUnitCostCzk)
            .FirstOrDefaultAsync(ct) ?? 1;

        return new FleetKpiDto(
            agg.Rides,
            agg.RevenueCzk,
            agg.AvgPriceCzk,
            agg.AvgTimeToAssignSeconds,
            agg.AvgTimeToPickupSeconds,
            Math.Round(agg.CancellationRate, 4),
            agg.AppOrders,
            agg.PhoneOrders,
            agg.FixedRouteOrders,
            smsCount,
            smsCount * smsUnitCost);
    }

    private async Task<List<RidesPerDayDto>> ComputeRidesPerDayAsync(
        Guid fleetId, DateTimeOffset winStart, DateTimeOffset winEnd, CancellationToken ct)
    {
        var rows = await dbContext.Database.SqlQuery<RidesPerDayRow>(
            $"""
             SELECT (created_at AT TIME ZONE 'Europe/Prague')::date AS "day",
                    COUNT(*)::int AS "count"
             FROM orders
             WHERE fleet_id = {fleetId} AND created_at >= {winStart} AND created_at < {winEnd}
             GROUP BY (created_at AT TIME ZONE 'Europe/Prague')::date
             ORDER BY 1
             """).ToListAsync(ct);

        return rows
            .Select(r => new RidesPerDayDto(
                DateOnly.FromDateTime(r.Day).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                r.Count))
            .ToList();
    }

    private async Task<List<TopRouteDto>> ComputeTopRoutesAsync(
        DateTimeOffset winStart, DateTimeOffset winEnd, CancellationToken ct)
    {
        // Tenant-scoped via the global query filter on Orders and Routes. Group by route, join name,
        // order by count desc — all server-side.
        var grouped = await dbContext.Orders.AsNoTracking()
            .Where(o => o.RouteId != null && o.CreatedAt >= winStart && o.CreatedAt < winEnd)
            .GroupBy(o => o.RouteId!.Value)
            .Select(g => new { RouteId = g.Key, Count = g.Count() })
            .OrderByDescending(x => x.Count)
            .Take(TopRoutesLimit)
            .Join(dbContext.Routes.AsNoTracking(),
                g => g.RouteId,
                r => r.Id,
                (g, r) => new TopRouteDto(r.Id, r.Name, g.Count))
            .ToListAsync(ct);

        return grouped;
    }

    /// <summary>Converts a Prague calendar day boundary to its UTC instant.</summary>
    private static DateTimeOffset ToUtc(DateOnly pragueDay)
    {
        var local = pragueDay.ToDateTime(TimeOnly.MinValue);
        return new DateTimeOffset(TimeZoneInfo.ConvertTimeToUtc(local, PragueZone), TimeSpan.Zero);
    }

    /// <summary>Row shape for the SQL KPI aggregate.</summary>
    private sealed record FleetKpiRow(
        int Rides,
        int RevenueCzk,
        int AvgPriceCzk,
        double? AvgTimeToAssignSeconds,
        double? AvgTimeToPickupSeconds,
        double CancellationRate,
        int AppOrders,
        int PhoneOrders,
        int FixedRouteOrders);

    /// <summary>Row shape for the SQL rides-per-day aggregate.</summary>
    private sealed record RidesPerDayRow(DateTime Day, int Count);
}

using System.Runtime.CompilerServices;
using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Common.Geo;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Features.Analytics.Shared;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Features.Analytics.GetDemand;

/// <summary>Returns demand and capacity analytics for the fleet: demand heat-map, supply-vs-demand per hour,
/// unmet demand (never-accepted cancellations), driver utilization, zone pickup counts (bounding-box approximation —
/// circle zones use center ± radius/111320° lat / radius/(111320·cos(lat))° lng; polygon zones use vertex min/max;
/// some cross-zone overlap is expected), and top pickup→dropoff routes.
/// All aggregation is SQL-only; Prague local time for hour/day-of-week bucketing.</summary>
internal sealed class GetDemandEndpoint(TaxiDbContext dbContext, ICurrentTenant currentTenant, TimeProvider timeProvider)
    : Endpoint<AnalyticsRangeRequest, GetDemandResponse>
{
    private readonly AnalyticsFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Get("analytics/demand");
        Description(builder => builder
            .WithName(nameof(GetDemandEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.FleetAdminOnly));

        Summary(s =>
        {
            s.Summary = "Demand & capacity analytics (FleetAdmin)";
            s.Description =
                "Demand heat-map (hour × weekday, Prague local), supply-vs-demand per hour, " +
                "unmet demand (cancelled with no driver ever accepting), driver utilization " +
                "(accept→complete share of online time), zone pickup counts (bounding-box, " +
                "circle zones use cos-corrected longitude delta, some cross-zone overlap expected), " +
                "and top pickup→dropoff routes. compare=true recomputes all sections for the prior equal-length period.";
            s.Responses[StatusCodes.Status200OK] = "Demand analytics.";
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

        // Load all fleet zones upfront for bbox derivation (no N+1 — zones per fleet is small).
        var zones = await dbContext.Zones
            .AsNoTracking()
            .Where(z => z.FleetId == fleetId && z.IsEnabled)
            .ToListAsync(ct);

        var heatmap = await ComputeHeatmapAsync(fleetId, winStart, winEnd, ct);
        var supplyDemand = await ComputeSupplyDemandAsync(fleetId, winStart, winEnd, ct);
        var unmetDemand = await ComputeUnmetDemandAsync(fleetId, winStart, winEnd, ct);
        var utilization = await ComputeUtilizationAsync(fleetId, winStart, winEnd, ct);
        var zonePickups = await ComputeZonePickupsAsync(fleetId, winStart, winEnd, zones, ct);
        var topRoutes = await ComputeTopRoutesAsync(fleetId, winStart, winEnd, ct);

        GetDemandPriorDto? prior = null;
        if (req.Compare && priorStart is not null && priorEnd is not null)
        {
            prior = new GetDemandPriorDto(
                Heatmap: await ComputeHeatmapAsync(fleetId, priorStart.Value, priorEnd.Value, ct),
                SupplyDemand: await ComputeSupplyDemandAsync(fleetId, priorStart.Value, priorEnd.Value, ct),
                UnmetDemand: await ComputeUnmetDemandAsync(fleetId, priorStart.Value, priorEnd.Value, ct),
                Utilization: await ComputeUtilizationAsync(fleetId, priorStart.Value, priorEnd.Value, ct),
                ZonePickups: await ComputeZonePickupsAsync(fleetId, priorStart.Value, priorEnd.Value, zones, ct),
                TopRoutes: await ComputeTopRoutesAsync(fleetId, priorStart.Value, priorEnd.Value, ct));
        }

        await Send.OkAsync(new GetDemandResponse(
            heatmap, supplyDemand, unmetDemand, utilization, zonePickups, topRoutes, prior), ct);
    }

    // ── Heatmap: orders by hour-of-day × day-of-week (Prague local) ──────────

    private async Task<List<HeatmapCellDto>> ComputeHeatmapAsync(
        Guid fleetId, DateTimeOffset winStart, DateTimeOffset winEnd, CancellationToken ct)
    {
        var rows = await dbContext.Database.SqlQuery<HeatmapRow>(
            $"""
             SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE 'Europe/Prague')::int AS "hour",
                    EXTRACT(DOW  FROM created_at AT TIME ZONE 'Europe/Prague')::int AS "dow",
                    COUNT(*)::int                                                   AS "count"
             FROM orders
             WHERE fleet_id = {fleetId}
               AND created_at >= {winStart}
               AND created_at < {winEnd}
             GROUP BY EXTRACT(HOUR FROM created_at AT TIME ZONE 'Europe/Prague'),
                      EXTRACT(DOW  FROM created_at AT TIME ZONE 'Europe/Prague')
             ORDER BY 2, 1
             """).ToListAsync(ct);

        return rows.Select(r => new HeatmapCellDto(r.Hour, r.Dow, r.Count)).ToList();
    }

    // ── Supply vs demand per Prague hour-of-day ───────────────────────────────
    // Aggregates orders created (demand) and shift online-seconds (clamped to each Prague hour)
    // across the full window, grouped by hour-of-day (0–23). This is a cross-day aggregation —
    // e.g. "all Monday 09:00–10:00 slots in the window" → one row with hour=9.

    private async Task<List<SupplyDemandBucketDto>> ComputeSupplyDemandAsync(
        Guid fleetId, DateTimeOffset winStart, DateTimeOffset winEnd, CancellationToken ct)
    {
        // Demand side: group orders by Prague hour-of-day.
        var demandRows = await dbContext.Database.SqlQuery<DemandHourRow>(
            $"""
             SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE 'Europe/Prague')::int AS "hour",
                    COUNT(*)::int                                                     AS "total",
                    COUNT(*) FILTER (WHERE status = 'Completed')::int                AS "completed"
             FROM orders
             WHERE fleet_id = {fleetId}
               AND created_at >= {winStart}
               AND created_at < {winEnd}
             GROUP BY EXTRACT(HOUR FROM created_at AT TIME ZONE 'Europe/Prague')
             ORDER BY 1
             """).ToListAsync(ct);

        // Supply side: sum clamped online seconds per Prague hour-of-day.
        // generate_series produces one row per calendar-hour UTC in the window.
        // We join to driver_shifts via overlap, compute clamped seconds, then aggregate
        // by EXTRACT(HOUR FROM gs AT TIME ZONE 'Europe/Prague') (hour-of-day, not calendar hour).
        var supplyRows = await dbContext.Database.SqlQuery<SupplyHourRow>(
            $"""
             SELECT EXTRACT(HOUR FROM gs AT TIME ZONE 'Europe/Prague')::int AS "hour",
                    COALESCE(SUM(
                        EXTRACT(EPOCH FROM (
                            LEAST(COALESCE(ds.ended_at, {winEnd}), gs + INTERVAL '1 hour')
                            - GREATEST(ds.started_at, gs)
                        ))
                    ), 0)::int AS "online"
             FROM generate_series({winStart}::timestamptz, {winEnd}::timestamptz - INTERVAL '1 hour', INTERVAL '1 hour') gs
             JOIN driver_shifts ds ON ds.fleet_id = {fleetId}
               AND ds.started_at < gs + INTERVAL '1 hour'
               AND COALESCE(ds.ended_at, {winEnd}) > gs
             GROUP BY EXTRACT(HOUR FROM gs AT TIME ZONE 'Europe/Prague')
             ORDER BY 1
             """).ToListAsync(ct);

        // Merge demand and supply by hour-of-day.
        var supplyByHour = supplyRows.ToDictionary(r => r.Hour, r => r.Online);

        return demandRows.Select(d =>
        {
            var onlineSec = supplyByHour.GetValueOrDefault(d.Hour, 0);
            var rate = d.Total > 0 ? Math.Round((double)d.Completed / d.Total, 4) : 0.0;
            return new SupplyDemandBucketDto(d.Hour, d.Total, onlineSec, rate);
        }).ToList();
    }

    // ── Unmet demand: cancelled orders with no Accepted event ─────────────────

    private async Task<List<UnmetDemandBucketDto>> ComputeUnmetDemandAsync(
        Guid fleetId, DateTimeOffset winStart, DateTimeOffset winEnd, CancellationToken ct)
    {
        var rows = await dbContext.Database.SqlQuery<UnmetRow>(
            $"""
             SELECT EXTRACT(HOUR FROM o.created_at AT TIME ZONE 'Europe/Prague')::int AS "hour",
                    COUNT(*)::int                                                       AS "count"
             FROM orders o
             WHERE o.fleet_id = {fleetId}
               AND o.created_at >= {winStart}
               AND o.created_at < {winEnd}
               AND o.status = 'Cancelled'
               AND NOT EXISTS (
                   SELECT 1
                   FROM order_events oe
                   WHERE oe.order_id = o.id
                     AND oe.type = 'Accepted'
               )
             GROUP BY EXTRACT(HOUR FROM o.created_at AT TIME ZONE 'Europe/Prague')
             ORDER BY 1
             """).ToListAsync(ct);

        return rows.Select(r => new UnmetDemandBucketDto(r.Hour, r.Count)).ToList();
    }

    // ── Utilization: accept→complete busy time as share of online time ────────

    private async Task<UtilizationDto> ComputeUtilizationAsync(
        Guid fleetId, DateTimeOffset winStart, DateTimeOffset winEnd, CancellationToken ct)
    {
        // Per-driver busy seconds: sum of (completed_at - accepted_at) for completed orders in window.
        var busyRows = await dbContext.Database.SqlQuery<DriverBusyRow>(
            $"""
             SELECT driver_id AS "driver",
                    COALESCE(SUM(EXTRACT(EPOCH FROM (completed_at - accepted_at))), 0)::int AS "busy"
             FROM orders
             WHERE fleet_id = {fleetId}
               AND created_at >= {winStart}
               AND created_at < {winEnd}
               AND status = 'Completed'
               AND driver_id IS NOT NULL
               AND accepted_at IS NOT NULL
               AND completed_at IS NOT NULL
             GROUP BY driver_id
             """).ToListAsync(ct);

        // Per-driver online seconds: sum of closed shift durations clamped to the window.
        var onlineRows = await dbContext.Database.SqlQuery<DriverOnlineRow>(
            $"""
             SELECT driver_id AS "driver",
                    COALESCE(SUM(
                        EXTRACT(EPOCH FROM (
                            LEAST(ended_at, {winEnd}) - GREATEST(started_at, {winStart})
                        ))
                    ) FILTER (
                        WHERE ended_at IS NOT NULL
                          AND started_at < {winEnd}
                          AND ended_at > {winStart}
                    ), 0)::int AS "online"
             FROM driver_shifts
             WHERE fleet_id = {fleetId}
             GROUP BY driver_id
             """).ToListAsync(ct);

        var busyByDriver = busyRows.ToDictionary(r => r.Driver, r => r.Busy);
        var onlineByDriver = onlineRows.ToDictionary(r => r.Driver, r => r.Online);

        var allDriverIds = busyByDriver.Keys.Union(onlineByDriver.Keys).ToList();

        var perDriver = allDriverIds.Select(id =>
        {
            var busy = busyByDriver.GetValueOrDefault(id, 0);
            var online = onlineByDriver.GetValueOrDefault(id, 0);
            var util = online > 0 ? Math.Round((double)busy / online, 4) : 0.0;
            return new DriverUtilizationDto(id, busy, online, util);
        }).ToList();

        var totalBusy = perDriver.Sum(d => (long)d.BusySeconds);
        var totalOnline = perDriver.Sum(d => (long)d.OnlineSeconds);
        var fleetUtil = totalOnline > 0 ? Math.Round((double)totalBusy / totalOnline, 4) : 0.0;

        return new UtilizationDto(fleetUtil, perDriver);
    }

    // ── Zone pickup counts via bounding-box SQL ───────────────────────────────
    // Bounding box is computed app-side for each zone, then passed as SQL parameters.
    // Circle: latDelta = r/111320, lngDelta = r/(111320·cos(centerLat·π/180)) [radians!].
    // Polygon: min/max over vertex coordinates parsed from the jsonb array.
    // Overlap between zones is possible and accepted (documented in endpoint summary).

    private async Task<List<ZonePickupDto>> ComputeZonePickupsAsync(
        Guid fleetId,
        DateTimeOffset winStart,
        DateTimeOffset winEnd,
        List<Zone> zones,
        CancellationToken ct)
    {
        if (zones.Count == 0) return [];

        var result = new List<ZonePickupDto>(zones.Count);

        foreach (var zone in zones)
        {
            var (minLat, maxLat, minLng, maxLng) = ZoneBbox.Compute(zone);
            if (minLat > maxLat || minLng > maxLng) continue; // malformed zone, skip

            var count = await dbContext.Database.SqlQuery<CountRow>(
                $"""
                 SELECT COUNT(*)::int AS "total"
                 FROM orders
                 WHERE fleet_id = {fleetId}
                   AND created_at >= {winStart}
                   AND created_at < {winEnd}
                   AND pickup_lat BETWEEN {minLat} AND {maxLat}
                   AND pickup_lng BETWEEN {minLng} AND {maxLng}
                 """).SingleAsync(ct);

            result.Add(new ZonePickupDto(zone.Id, zone.Name, count.Total));
        }

        return result;
    }

    // ── Top routes by pickup+dropoff address pair ─────────────────────────────

    private async Task<List<TopRouteDto>> ComputeTopRoutesAsync(
        Guid fleetId, DateTimeOffset winStart, DateTimeOffset winEnd, CancellationToken ct)
    {
        var rows = await dbContext.Database.SqlQuery<RouteRow>(
            $"""
             SELECT pickup_address   AS "pickup",
                    dropoff_address  AS "dropoff",
                    COUNT(*)::int    AS "count"
             FROM orders
             WHERE fleet_id = {fleetId}
               AND created_at >= {winStart}
               AND created_at < {winEnd}
               AND dropoff_address IS NOT NULL
             GROUP BY pickup_address, dropoff_address
             ORDER BY COUNT(*) DESC
             LIMIT 20
             """).ToListAsync(ct);

        return rows.Select(r => new TopRouteDto(r.Pickup, r.Dropoff ?? string.Empty, r.Count)).ToList();
    }

    // ── Internal SQL row types ────────────────────────────────────────────────

    /// <summary>Row shape for the heatmap query.</summary>
    private sealed record HeatmapRow(int Hour, int Dow, int Count);

    /// <summary>Row shape for the demand-side hour aggregation.</summary>
    private sealed record DemandHourRow(int Hour, int Total, int Completed);

    /// <summary>Row shape for the supply-side (shift clamp) hour aggregation.</summary>
    private sealed record SupplyHourRow(int Hour, int Online);

    /// <summary>Row shape for the unmet demand query.</summary>
    private sealed record UnmetRow(int Hour, int Count);

    /// <summary>Row shape for per-driver busy seconds.</summary>
    private sealed record DriverBusyRow(Guid Driver, int Busy);

    /// <summary>Row shape for per-driver online seconds.</summary>
    private sealed record DriverOnlineRow(Guid Driver, int Online);

    /// <summary>Row shape for a single scalar COUNT query.</summary>
    private sealed record CountRow(int Total);

    /// <summary>Row shape for the top routes query.</summary>
    private sealed record RouteRow(string Pickup, string? Dropoff, int Count);
}

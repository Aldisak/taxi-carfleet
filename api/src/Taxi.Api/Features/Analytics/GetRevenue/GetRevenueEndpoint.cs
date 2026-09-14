using System.Globalization;
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

namespace Taxi.Api.Features.Analytics.GetRevenue;

/// <summary>Returns revenue analytics for the fleet: revenue series per bucket stacked by PaymentType
/// and split by OrderSource/PriceType, AOV trend, price-override impact (count, CZK delta, top reasons),
/// top routes by revenue, zone revenue (bounding-box pickup attribution), and SMS cost line
/// (sent-SMS count × SmsUnitCostCzk per bucket). All aggregation is SQL-only; compare=true recomputes
/// all sections for the prior equal-length period.</summary>
internal sealed class GetRevenueEndpoint(TaxiDbContext dbContext, ICurrentTenant currentTenant, TimeProvider timeProvider)
    : Endpoint<AnalyticsRangeRequest, GetRevenueResponse>
{
    private readonly AnalyticsFeatureConfiguration _featureConfiguration = new();

    private const int TopRoutesLimit = 20;
    private const int TopReasonsLimit = 10;

    /// <inheritdoc />
    public override void Configure()
    {
        Get("analytics/revenue");
        Description(builder => builder
            .WithName(nameof(GetRevenueEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.FleetAdminOnly));

        Summary(s =>
        {
            s.Summary = "Revenue analytics (FleetAdmin)";
            s.Description =
                "Revenue series per bucket stacked by PaymentType (cash/card/invoice) and split by " +
                "OrderSource and PriceType; AOV trend; price-override impact (count, total CZK delta, " +
                "top reasons); top pickup→dropoff routes by revenue; zone revenue (bounding-box pickup " +
                "attribution, circle zones use cos-corrected longitude delta); SMS cost line " +
                "(sent-SMS count × SmsUnitCostCzk from FleetSettings). compare=true recomputes all " +
                "sections for the prior equal-length period.";
            s.Responses[StatusCodes.Status200OK] = "Revenue analytics.";
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

        // Load fleet zones upfront (small per fleet — no N+1).
        var zones = await dbContext.Zones
            .AsNoTracking()
            .Where(z => z.FleetId == fleetId && z.IsEnabled)
            .ToListAsync(ct);

        // SMS unit cost (default 1 when no FleetSettings row; (int?) cast prevents zero-default trap).
        var smsUnitCost = await dbContext.FleetSettings.AsNoTracking()
            .Where(fs => fs.FleetId == fleetId)
            .Select(fs => (int?)fs.SmsUnitCostCzk)
            .FirstOrDefaultAsync(ct) ?? 1;

        var series = await ComputeSeriesAsync(fleetId, winStart, winEnd, truncUnit, ct);
        var aovTrend = await ComputeAovTrendAsync(fleetId, winStart, winEnd, truncUnit, ct);
        var priceOverride = await ComputePriceOverrideAsync(fleetId, winStart, winEnd, ct);
        var topRoutes = await ComputeTopRoutesAsync(fleetId, winStart, winEnd, ct);
        var zoneRevenue = await ComputeZoneRevenueAsync(fleetId, winStart, winEnd, zones, ct);
        var smsCost = await ComputeSmsCostAsync(fleetId, winStart, winEnd, truncUnit, smsUnitCost, ct);

        GetRevenuePriorDto? prior = null;
        if (req.Compare && priorStart is not null && priorEnd is not null)
        {
            prior = new GetRevenuePriorDto(
                Series: await ComputeSeriesAsync(fleetId, priorStart.Value, priorEnd.Value, truncUnit, ct),
                AovTrend: await ComputeAovTrendAsync(fleetId, priorStart.Value, priorEnd.Value, truncUnit, ct),
                PriceOverride: await ComputePriceOverrideAsync(fleetId, priorStart.Value, priorEnd.Value, ct),
                TopRoutes: await ComputeTopRoutesAsync(fleetId, priorStart.Value, priorEnd.Value, ct),
                ZoneRevenue: await ComputeZoneRevenueAsync(fleetId, priorStart.Value, priorEnd.Value, zones, ct),
                SmsCost: await ComputeSmsCostAsync(fleetId, priorStart.Value, priorEnd.Value, truncUnit, smsUnitCost, ct));
        }

        await Send.OkAsync(new GetRevenueResponse(series, aovTrend, priceOverride, topRoutes, zoneRevenue, smsCost, prior), ct);
    }

    // ── Revenue series per bucket, stacked by payment type + split by source/price type ────

    private async Task<List<RevenueBucketDto>> ComputeSeriesAsync(
        Guid fleetId, DateTimeOffset winStart, DateTimeOffset winEnd, string truncUnit, CancellationToken ct)
    {
        // truncUnit is validated to "day"|"week"|"month" — safe to embed as a string literal.
        var sql =
            $"SELECT date_trunc('{truncUnit}', completed_at AT TIME ZONE 'UTC')::date AS \"bucket\"," +
            " COALESCE(SUM(final_price_czk), 0)::int AS \"total\"," +
            " COUNT(*)::int AS \"rides\"," +
            " COALESCE(SUM(final_price_czk) FILTER (WHERE payment_type = 'Cash'), 0)::int AS \"cash\"," +
            " COALESCE(SUM(final_price_czk) FILTER (WHERE payment_type = 'Card'), 0)::int AS \"card\"," +
            " COALESCE(SUM(final_price_czk) FILTER (WHERE payment_type = 'Invoice'), 0)::int AS \"invoice\"," +
            " COALESCE(SUM(final_price_czk) FILTER (WHERE source = 'App'), 0)::int AS \"app\"," +
            " COALESCE(SUM(final_price_czk) FILTER (WHERE source = 'Phone'), 0)::int AS \"phone\"," +
            " COALESCE(SUM(final_price_czk) FILTER (WHERE source = 'Dispatcher'), 0)::int AS \"dispatcher\"," +
            " COALESCE(SUM(final_price_czk) FILTER (WHERE price_type = 'Meter'), 0)::int AS \"meter\"," +
            " COALESCE(SUM(final_price_czk) FILTER (WHERE price_type = 'Fixed'), 0)::int AS \"fixed\"," +
            " COALESCE(SUM(final_price_czk) FILTER (WHERE price_type = 'Estimate'), 0)::int AS \"estimate\"" +
            " FROM orders" +
            " WHERE fleet_id = {0}" +
            " AND status = 'Completed'" +
            " AND completed_at >= {1}" +
            " AND completed_at < {2}" +
            $" GROUP BY date_trunc('{truncUnit}', completed_at AT TIME ZONE 'UTC')" +
            " ORDER BY 1";

        var rows = await dbContext.Database
            .SqlQuery<RevenueRow>(FormattableStringFactory.Create(sql, fleetId, winStart, winEnd))
            .ToListAsync(ct);

        return rows.Select(r => new RevenueBucketDto(
            Bucket: r.Bucket.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            TotalCzk: r.Total,
            Rides: r.Rides,
            CashCzk: r.Cash,
            CardCzk: r.Card,
            InvoiceCzk: r.Invoice,
            AppCzk: r.App,
            PhoneCzk: r.Phone,
            DispatcherCzk: r.Dispatcher,
            MeterCzk: r.Meter,
            FixedCzk: r.Fixed,
            EstimateCzk: r.Estimate)).ToList();
    }

    // ── AOV trend per bucket ──────────────────────────────────────────────────

    private async Task<List<AovTrendBucketDto>> ComputeAovTrendAsync(
        Guid fleetId, DateTimeOffset winStart, DateTimeOffset winEnd, string truncUnit, CancellationToken ct)
    {
        // truncUnit is validated to "day"|"week"|"month" — safe to embed as a string literal.
        var sql =
            $"SELECT date_trunc('{truncUnit}', completed_at AT TIME ZONE 'UTC')::date AS \"bucket\"," +
            " COALESCE(ROUND(AVG(final_price_czk)), 0)::int AS \"aov\"" +
            " FROM orders" +
            " WHERE fleet_id = {0}" +
            " AND status = 'Completed'" +
            " AND completed_at >= {1}" +
            " AND completed_at < {2}" +
            $" GROUP BY date_trunc('{truncUnit}', completed_at AT TIME ZONE 'UTC')" +
            " ORDER BY 1";

        var rows = await dbContext.Database
            .SqlQuery<AovRow>(FormattableStringFactory.Create(sql, fleetId, winStart, winEnd))
            .ToListAsync(ct);

        return rows.Select(r => new AovTrendBucketDto(
            Bucket: r.Bucket.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            AovCzk: r.Aov)).ToList();
    }

    // ── Price-override impact: count, total CZK delta, top reasons ────────────
    // An override is when PriceOverrideReason is non-null (set by OrderService on completion).
    // Delta = FinalPriceCzk − (FixedPriceCzk for Fixed; EstimatedPriceCzk for Estimate; 0 for Meter).

    private async Task<PriceOverrideImpactDto> ComputePriceOverrideAsync(
        Guid fleetId, DateTimeOffset winStart, DateTimeOffset winEnd, CancellationToken ct)
    {
        var agg = await dbContext.Database.SqlQuery<OverrideAggRow>(
            $"""
             SELECT COUNT(*)::int AS "cnt",
                    COALESCE(SUM(
                        final_price_czk
                        - CASE price_type
                            WHEN 'Fixed'    THEN COALESCE(fixed_price_czk, final_price_czk)
                            WHEN 'Estimate' THEN COALESCE(estimated_price_czk, final_price_czk)
                            ELSE final_price_czk
                          END
                    ), 0)::int AS "delta"
             FROM orders
             WHERE fleet_id = {fleetId}
               AND status = 'Completed'
               AND completed_at >= {winStart}
               AND completed_at < {winEnd}
               AND price_override_reason IS NOT NULL
             """).SingleAsync(ct);

        var reasons = await dbContext.Database.SqlQuery<OverrideReasonRow>(
            $"""
             SELECT price_override_reason AS "reason",
                    COUNT(*)::int         AS "cnt"
             FROM orders
             WHERE fleet_id = {fleetId}
               AND status = 'Completed'
               AND completed_at >= {winStart}
               AND completed_at < {winEnd}
               AND price_override_reason IS NOT NULL
             GROUP BY price_override_reason
             ORDER BY COUNT(*) DESC
             LIMIT {TopReasonsLimit}
             """).ToListAsync(ct);

        return new PriceOverrideImpactDto(
            Count: agg.Cnt,
            TotalDeltaCzk: agg.Delta,
            TopReasons: reasons.Select(r => new OverrideReasonDto(r.Reason, r.Cnt)).ToList());
    }

    // ── Top routes by revenue ─────────────────────────────────────────────────

    private async Task<List<RevenueTopRouteDto>> ComputeTopRoutesAsync(
        Guid fleetId, DateTimeOffset winStart, DateTimeOffset winEnd, CancellationToken ct)
    {
        var rows = await dbContext.Database.SqlQuery<RouteRevenueRow>(
            $"""
             SELECT pickup_address                      AS "pickup",
                    dropoff_address                     AS "dropoff",
                    COUNT(*)::int                       AS "rides",
                    COALESCE(SUM(final_price_czk), 0)::int AS "revenue",
                    COALESCE(ROUND(AVG(final_price_czk)), 0)::int AS "aov"
             FROM orders
             WHERE fleet_id = {fleetId}
               AND status = 'Completed'
               AND completed_at >= {winStart}
               AND completed_at < {winEnd}
               AND dropoff_address IS NOT NULL
             GROUP BY pickup_address, dropoff_address
             ORDER BY SUM(final_price_czk) DESC NULLS LAST
             LIMIT {TopRoutesLimit}
             """).ToListAsync(ct);

        return rows.Select(r => new RevenueTopRouteDto(
            PickupAddress: r.Pickup,
            DropoffAddress: r.Dropoff ?? string.Empty,
            Rides: r.Rides,
            RevenueCzk: r.Revenue,
            AovCzk: r.Aov)).ToList();
    }

    // ── Zone revenue (bounding-box pickup attribution) ────────────────────────

    private async Task<List<ZoneRevenueDto>> ComputeZoneRevenueAsync(
        Guid fleetId, DateTimeOffset winStart, DateTimeOffset winEnd, List<Zone> zones, CancellationToken ct)
    {
        if (zones.Count == 0) return [];

        var result = new List<ZoneRevenueDto>(zones.Count);

        foreach (var zone in zones)
        {
            var (minLat, maxLat, minLng, maxLng) = ZoneBbox.Compute(zone);
            if (minLat > maxLat || minLng > maxLng) continue; // malformed zone, skip

            var row = await dbContext.Database.SqlQuery<ZoneAggRow>(
                $"""
                 SELECT COUNT(*)::int                           AS "rides",
                        COALESCE(SUM(final_price_czk), 0)::int AS "revenue",
                        COALESCE(ROUND(AVG(final_price_czk)), 0)::int AS "aov"
                 FROM orders
                 WHERE fleet_id = {fleetId}
                   AND status = 'Completed'
                   AND completed_at >= {winStart}
                   AND completed_at < {winEnd}
                   AND pickup_lat BETWEEN {minLat} AND {maxLat}
                   AND pickup_lng BETWEEN {minLng} AND {maxLng}
                 """).SingleAsync(ct);

            result.Add(new ZoneRevenueDto(zone.Id, zone.Name, row.Rides, row.Revenue, row.Aov));
        }

        return result;
    }

    // ── SMS cost per bucket ───────────────────────────────────────────────────

    private async Task<List<SmsCostBucketDto>> ComputeSmsCostAsync(
        Guid fleetId, DateTimeOffset winStart, DateTimeOffset winEnd, string truncUnit, int smsUnitCost, CancellationToken ct)
    {
        // truncUnit is validated to "day"|"week"|"month" — safe to embed as a string literal.
        var sql =
            $"SELECT date_trunc('{truncUnit}', created_at AT TIME ZONE 'UTC')::date AS \"bucket\"," +
            " COUNT(*)::int AS \"smscount\"" +
            " FROM notification_log" +
            " WHERE fleet_id = {0}" +
            " AND channel = 'Sms'" +
            " AND status = 'Sent'" +
            " AND created_at >= {1}" +
            " AND created_at < {2}" +
            $" GROUP BY date_trunc('{truncUnit}', created_at AT TIME ZONE 'UTC')" +
            " ORDER BY 1";

        var rows = await dbContext.Database
            .SqlQuery<SmsBucketRow>(FormattableStringFactory.Create(sql, fleetId, winStart, winEnd))
            .ToListAsync(ct);

        return rows.Select(r => new SmsCostBucketDto(
            Bucket: r.Bucket.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            SmsCount: r.Smscount,
            CostCzk: r.Smscount * smsUnitCost)).ToList();
    }

    // ── Internal SQL row types ────────────────────────────────────────────────

    /// <summary>Row shape for the revenue series query.</summary>
    private sealed record RevenueRow(
        DateTime Bucket, int Total, int Rides,
        int Cash, int Card, int Invoice,
        int App, int Phone, int Dispatcher,
        int Meter, int Fixed, int Estimate);

    /// <summary>Row shape for the AOV trend query.</summary>
    private sealed record AovRow(DateTime Bucket, int Aov);

    /// <summary>Row shape for the price-override aggregate query.</summary>
    private sealed record OverrideAggRow(int Cnt, int Delta);

    /// <summary>Row shape for the price-override top-reasons query.</summary>
    private sealed record OverrideReasonRow(string Reason, int Cnt);

    /// <summary>Row shape for the top-routes-by-revenue query.</summary>
    private sealed record RouteRevenueRow(string Pickup, string? Dropoff, int Rides, int Revenue, int Aov);

    /// <summary>Row shape for the per-zone revenue aggregate.</summary>
    private sealed record ZoneAggRow(int Rides, int Revenue, int Aov);

    /// <summary>Row shape for the SMS cost per bucket query.</summary>
    private sealed record SmsBucketRow(DateTime Bucket, int Smscount);
}

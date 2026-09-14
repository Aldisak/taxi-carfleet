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

namespace Taxi.Api.Features.Analytics.GetCustomers;

/// <summary>Returns customer behaviour analytics for the fleet:
/// new-vs-returning rides, repeat rate, frequency distribution (1/2–5/6+),
/// monthly cohort retention triangle (acquisition × months-since, up to +5 columns),
/// top customers by rides and revenue, and ratings analysis (distribution 1–5, avg trend, worst-rated list).
/// GDPR: anonymized customers (phone '+420000000000') count toward volume/revenue but are excluded from
/// all identity-based metrics (new/returning, frequency, cohorts, top customers).
/// compare=true recomputes all sections for the prior equal-length period.
/// All aggregation is SQL-only; customer names fetched via MAX() (no N+1).</summary>
internal sealed class GetCustomersEndpoint(TaxiDbContext dbContext, ICurrentTenant currentTenant, TimeProvider timeProvider)
    : Endpoint<AnalyticsRangeRequest, GetCustomersResponse>
{
    private readonly AnalyticsFeatureConfiguration _featureConfiguration = new();

    private const string AnonymizedPhone = "+420000000000";
    private const int MaxCohortMonths = 5;

    /// <inheritdoc />
    public override void Configure()
    {
        Get("analytics/customers");
        Description(builder => builder
            .WithName(nameof(GetCustomersEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.FleetAdminOnly));

        Summary(s =>
        {
            s.Summary = "Customer behaviour analytics (FleetAdmin)";
            s.Description =
                "New-vs-returning rides per bucket, repeat rate, frequency distribution (1/2–5/6+ rides), " +
                "monthly cohort retention triangle (acquisition × months-since, up to +5 columns), " +
                "top customers by rides and revenue (unmasked), ratings analysis. " +
                "Anonymized customers (phone +420000000000) count toward volume/revenue but are excluded " +
                "from all identity-based metrics. compare=true recomputes for the prior equal-length period.";
            s.Responses[StatusCodes.Status200OK] = "Customer analytics.";
            s.Responses[StatusCodes.Status400BadRequest] = "Invalid date or range.";
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

        var current = await ComputeAllAsync(fleetId, winStart, winEnd, truncUnit, ct);

        GetCustomersPriorDto? prior = null;
        if (req.Compare && priorStart is not null && priorEnd is not null)
        {
            var p = await ComputeAllAsync(fleetId, priorStart.Value, priorEnd.Value, truncUnit, ct);
            prior = new GetCustomersPriorDto(
                TotalRides: p.TotalRides,
                TotalRevenueCzk: p.TotalRevenueCzk,
                NewIdentities: p.NewIdentities,
                ReturningIdentities: p.ReturningIdentities,
                RepeatRate: p.RepeatRate,
                FreqOne: p.FreqOne,
                FreqTwoToFive: p.FreqTwoToFive,
                FreqSixPlus: p.FreqSixPlus,
                NewVsReturningBuckets: p.NewVsReturningBuckets,
                CohortRows: p.CohortRows,
                TopCustomers: p.TopCustomers,
                Ratings: p.Ratings);
        }

        await Send.OkAsync(new GetCustomersResponse(
            TotalRides: current.TotalRides,
            TotalRevenueCzk: current.TotalRevenueCzk,
            NewIdentities: current.NewIdentities,
            ReturningIdentities: current.ReturningIdentities,
            RepeatRate: current.RepeatRate,
            FreqOne: current.FreqOne,
            FreqTwoToFive: current.FreqTwoToFive,
            FreqSixPlus: current.FreqSixPlus,
            NewVsReturningBuckets: current.NewVsReturningBuckets,
            CohortRows: current.CohortRows,
            TopCustomers: current.TopCustomers,
            Ratings: current.Ratings,
            Prior: prior), ct);
    }

    // ── All sections computation ──────────────────────────────────────────────

    private async Task<ComputedBlock> ComputeAllAsync(
        Guid fleetId, DateTimeOffset winStart, DateTimeOffset winEnd, string truncUnit, CancellationToken ct)
    {
        // 1. Volume: total rides + revenue (includes anonymized)
        var volumeRows = await dbContext.Database.SqlQuery<VolumeRow>(
            $"""
             SELECT COUNT(*)::int AS "rides",
                    COALESCE(SUM(final_price_czk), 0)::int AS "revenue"
             FROM orders
             WHERE fleet_id = {fleetId}
               AND status = 'Completed'
               AND completed_at >= {winStart}
               AND completed_at < {winEnd}
             """).ToListAsync(ct);

        var totalRides = volumeRows.FirstOrDefault()?.Rides ?? 0;
        var totalRevenue = volumeRows.FirstOrDefault()?.Revenue ?? 0;

        // 2. Per-identity aggregates (excludes anonymized) for new/returning, frequency, top customers.
        //    Identity = customer_user_id::text (when non-null) or customer_phone.
        //    Step A: load the minimum completed_at per identity over ALL time (for new/returning classification).
        //    Step B: load window rides per identity.
        //    Merge in memory: returning = identity that exists in all-time with min_completed_at < winStart.

        // All-time first ride per identity (excludes anonymized)
        var firstRideRows = await dbContext.Database.SqlQuery<IdentityFirstRideRow>(
            $"""
             SELECT CASE WHEN customer_user_id IS NOT NULL
                         THEN customer_user_id::text
                         ELSE customer_phone
                    END AS "identity",
                    MIN(completed_at) AS "firstride"
             FROM orders
             WHERE fleet_id = {fleetId}
               AND status = 'Completed'
               AND customer_phone != {AnonymizedPhone}
             GROUP BY CASE WHEN customer_user_id IS NOT NULL
                           THEN customer_user_id::text
                           ELSE customer_phone
                      END
             """).ToListAsync(ct);

        // Window rides per identity (excludes anonymized)
        // Note: PostgreSQL does not support MAX(uuid) — cast to text first, then back to uuid.
        var windowIdentityRows = await dbContext.Database.SqlQuery<WindowIdentityRow>(
            $"""
             SELECT CASE WHEN customer_user_id IS NOT NULL
                         THEN customer_user_id::text
                         ELSE customer_phone
                    END AS "identity",
                    MAX(customer_user_id::text)::uuid AS "userid",
                    MAX(customer_phone) AS "phone",
                    MAX(customer_name) AS "name",
                    COUNT(*)::int AS "windowrides",
                    COALESCE(SUM(final_price_czk), 0)::int AS "windowrevenue"
             FROM orders
             WHERE fleet_id = {fleetId}
               AND status = 'Completed'
               AND customer_phone != {AnonymizedPhone}
               AND completed_at >= {winStart}
               AND completed_at < {winEnd}
             GROUP BY CASE WHEN customer_user_id IS NOT NULL
                           THEN customer_user_id::text
                           ELSE customer_phone
                      END
             """).ToListAsync(ct);

        // Merge in memory: classify new vs returning
        var firstRideMap = firstRideRows.ToDictionary(r => r.Identity, r => r.Firstride);
        var identityRows = windowIdentityRows.Select(r =>
        {
            // Returning = identity's first-ever ride was before the window start
            var isReturning = firstRideMap.TryGetValue(r.Identity, out var firstRide) && firstRide < winStart;
            return new IdentityAggInfo(r, isReturning);
        }).ToList();

        // New identities: first-ever ride is IN the window (first ride >= winStart)
        var newIdentities = identityRows.Count(r => !r.IsReturning);
        // Returning identities: had a ride before winStart
        var returningIdentities = identityRows.Count(r => r.IsReturning);

        var totalIdentities = newIdentities + returningIdentities;
        var repeatRate = totalIdentities > 0 ? returningIdentities * 100.0 / totalIdentities : 0.0;

        // Frequency distribution (by windowrides count)
        var freqOne = identityRows.Count(r => r.Row.Windowrides == 1);
        var freqTwoToFive = identityRows.Count(r => r.Row.Windowrides is >= 2 and <= 5);
        var freqSixPlus = identityRows.Count(r => r.Row.Windowrides >= 6);

        // Top customers: sort by windowrides DESC, then windowrevenue DESC, take 20
        var topCustomers = identityRows
            .OrderByDescending(r => r.Row.Windowrides)
            .ThenByDescending(r => r.Row.Windowrevenue)
            .Take(20)
            .Select(r => new TopCustomerDto(
                CustomerUserId: r.Row.Userid,
                CustomerPhone: r.Row.Phone,
                CustomerName: r.Row.Name,
                Rides: r.Row.Windowrides,
                RevenueCzk: r.Row.Windowrevenue))
            .ToList();

        // 3. Per-bucket new-vs-returning rides (excludes anonymized)
        //    Group by Prague-local bucket + identity; classify using firstRideMap.
        //    truncUnit cannot be a SQL parameter — use FormattableStringFactory like ComputeRatingsAsync.
        var nvrbSql =
            $"SELECT date_trunc('{truncUnit}', completed_at AT TIME ZONE 'Europe/Prague')::date AS \"bucket\", " +
            $"CASE WHEN customer_user_id IS NOT NULL THEN customer_user_id::text ELSE customer_phone END AS \"identity\", " +
            $"COUNT(*)::int AS \"rides\" " +
            $"FROM orders " +
            $"WHERE fleet_id = {{0}} AND status = 'Completed' " +
            $"AND customer_phone != {{3}} " +
            $"AND completed_at >= {{1}} AND completed_at < {{2}} " +
            $"GROUP BY 1, 2 " +
            $"ORDER BY 1";

        var nvrbRawRows = await dbContext.Database
            .SqlQuery<NewVsReturningRawRow>(FormattableStringFactory.Create(nvrbSql, fleetId, winStart, winEnd, AnonymizedPhone))
            .ToListAsync(ct);

        // Aggregate per bucket: classify each row's identity as new/returning using firstRideMap.
        var bucketMap = new Dictionary<DateTime, (int NewRides, int ReturningRides)>();
        foreach (var row in nvrbRawRows)
        {
            var isRet = firstRideMap.TryGetValue(row.Identity, out var fr) && fr < winStart;
            bucketMap.TryGetValue(row.Bucket, out var existing);
            bucketMap[row.Bucket] = isRet
                ? (existing.NewRides, existing.ReturningRides + row.Rides)
                : (existing.NewRides + row.Rides, existing.ReturningRides);
        }

        var newVsReturningBuckets = bucketMap
            .OrderBy(kv => kv.Key)
            .Select(kv => new NewVsReturningBucketDto(
                Bucket: kv.Key.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                NewRides: kv.Value.NewRides,
                ReturningRides: kv.Value.ReturningRides))
            .ToList();

        // 4. Cohort triangle (identity-based, excludes anonymized)
        var cohortRows = await ComputeCohortAsync(fleetId, winStart, winEnd, ct);

        // 5. Ratings analysis (all completed rides in window, including anonymized)
        var ratings = await ComputeRatingsAsync(fleetId, winStart, winEnd, truncUnit, ct);

        return new ComputedBlock(
            TotalRides: totalRides,
            TotalRevenueCzk: totalRevenue,
            NewIdentities: newIdentities,
            ReturningIdentities: returningIdentities,
            RepeatRate: repeatRate,
            FreqOne: freqOne,
            FreqTwoToFive: freqTwoToFive,
            FreqSixPlus: freqSixPlus,
            NewVsReturningBuckets: newVsReturningBuckets,
            CohortRows: cohortRows,
            TopCustomers: topCustomers,
            Ratings: ratings);
    }

    // ── Cohort triangle ───────────────────────────────────────────────────────
    // Acquisition month = first-EVER completed ride month (Prague TZ) per customer_user_id.
    // Activity month = each subsequent (or same) completed ride month.
    // Capped at MaxCohortMonths (5) months since acquisition.
    // Only customer_user_id based (phone-only not trackable over time reliably).

    private async Task<List<CustomerCohortRowDto>> ComputeCohortAsync(
        Guid fleetId, DateTimeOffset winStart, DateTimeOffset winEnd, CancellationToken ct)
    {
        var rawRows = await dbContext.Database.SqlQuery<CohortRawRow>(
            $"""
             WITH first_month AS (
                 SELECT customer_user_id,
                        date_trunc('month', MIN(completed_at) AT TIME ZONE 'Europe/Prague') AS "acq"
                 FROM orders
                 WHERE fleet_id = {fleetId}
                   AND status = 'Completed'
                   AND customer_user_id IS NOT NULL
                   AND customer_phone != {AnonymizedPhone}
                 GROUP BY customer_user_id
             )
             SELECT fm.acq AS "acq_month",
                    date_trunc('month', o.completed_at AT TIME ZONE 'Europe/Prague') AS "act_month",
                    COUNT(DISTINCT o.customer_user_id)::int AS "count"
             FROM orders o
             JOIN first_month fm ON fm.customer_user_id = o.customer_user_id
             WHERE o.fleet_id = {fleetId}
               AND o.status = 'Completed'
               AND o.customer_user_id IS NOT NULL
               AND o.customer_phone != {AnonymizedPhone}
               AND o.completed_at >= {winStart}
               AND o.completed_at < {winEnd}
             GROUP BY fm.acq, date_trunc('month', o.completed_at AT TIME ZONE 'Europe/Prague')
             ORDER BY "acq_month", "act_month"
             """).ToListAsync(ct);

        // Transform raw (acq_month, act_month, count) into (acq_label, months_since, active).
        // Filter out rows where months_since > MaxCohortMonths.
        var result = new List<CustomerCohortRowDto>();
        foreach (var row in rawRows)
        {
            var acqDate = row.AcqMonth;
            var actDate = row.ActMonth;
            var monthsSince = (actDate.Year - acqDate.Year) * 12 + (actDate.Month - acqDate.Month);
            if (monthsSince < 0 || monthsSince > MaxCohortMonths) continue;

            var acqLabel = acqDate.ToString("yyyy-MM", CultureInfo.InvariantCulture);
            result.Add(new CustomerCohortRowDto(
                AcqMonthLabel: acqLabel,
                MonthsSince: monthsSince,
                ActiveCustomers: row.Count));
        }

        return result;
    }

    // ── Ratings analysis ──────────────────────────────────────────────────────

    private const int WorstRatedThreshold = 3;
    private const int WorstRatedLimit = 20;

    private async Task<RatingsAnalysisDto> ComputeRatingsAsync(
        Guid fleetId, DateTimeOffset winStart, DateTimeOffset winEnd, string truncUnit, CancellationToken ct)
    {
        // Rating distribution: count per star level (1–5) in window
        var distRows = await dbContext.Database.SqlQuery<RatingDistRow>(
            $"""
             SELECT rating_stars AS "stars",
                    COUNT(*)::int AS "count"
             FROM orders
             WHERE fleet_id = {fleetId}
               AND status = 'Completed'
               AND rating_stars IS NOT NULL
               AND completed_at >= {winStart}
               AND completed_at < {winEnd}
             GROUP BY rating_stars
             ORDER BY rating_stars
             """).ToListAsync(ct);

        var totalRated = distRows.Sum(r => r.Count);
        double? avgRating = totalRated > 0
            ? distRows.Sum(r => r.Stars * (double)r.Count) / totalRated
            : null;

        var distribution = distRows
            .Select(r => new RatingBucketDto(Stars: r.Stars, Count: r.Count))
            .ToList();

        // Avg rating per bucket — date_trunc unit cannot be a SQL parameter: use FormattableStringFactory.
        // All rated rides in window (including anonymized orders).
        var trendSql =
            $"SELECT date_trunc('{truncUnit}', completed_at AT TIME ZONE 'Europe/Prague')::date AS \"bucket\", " +
            $"COUNT(*)::int AS \"count\", " +
            $"AVG(rating_stars::float8) AS \"avgrating\" " +
            $"FROM orders " +
            $"WHERE fleet_id = {{0}} AND status = 'Completed' AND rating_stars IS NOT NULL " +
            $"AND completed_at >= {{1}} AND completed_at < {{2}} " +
            $"GROUP BY date_trunc('{truncUnit}', completed_at AT TIME ZONE 'Europe/Prague') " +
            $"ORDER BY 1";

        var trendRows = await dbContext.Database
            .SqlQuery<RatingTrendRow>(FormattableStringFactory.Create(trendSql, fleetId, winStart, winEnd))
            .ToListAsync(ct);

        var avgTrend = trendRows
            .Select(r => new RatingTrendBucketDto(
                Bucket: r.Bucket.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                Rides: r.Count,
                AvgRating: r.Avgrating.HasValue ? Math.Round(r.Avgrating.Value, 2) : null))
            .ToList();

        // Worst-rated orders (≤3 stars) joined with drivers → users for driver name.
        // Load from DB using LINQ (no JsonDocument projection issue here) then join driver names in memory.
        var worstOrders = await dbContext.Orders.AsNoTracking()
            .Where(o => o.FleetId == fleetId
                     && o.Status == Infrastructure.Entities.OrderStatus.Completed
                     && o.RatingStars != null
                     && o.RatingStars <= WorstRatedThreshold
                     && o.CompletedAt >= winStart
                     && o.CompletedAt < winEnd)
            .OrderByDescending(o => o.CompletedAt)
            .Take(WorstRatedLimit)
            .Select(o => new { o.Id, o.PublicCode, o.CompletedAt, o.RatingStars, o.RatingComment, o.DriverId })
            .ToListAsync(ct);

        // Batch-fetch driver names (no N+1): one JOIN query for all driver IDs in the result set.
        var driverIds = worstOrders
            .Where(o => o.DriverId.HasValue)
            .Select(o => o.DriverId!.Value)
            .Distinct()
            .ToList();

        Dictionary<Guid, string> driverNameMap = new();
        if (driverIds.Count > 0)
        {
            var driverNames = await dbContext.Drivers.AsNoTracking()
                .Where(d => driverIds.Contains(d.Id))
                .Join(dbContext.Users.AsNoTracking(),
                    d => d.UserId,
                    u => u.Id,
                    (d, u) => new { d.Id, u.DisplayName })
                .ToListAsync(ct);
            driverNameMap = driverNames.ToDictionary(x => x.Id, x => x.DisplayName);
        }

        var worstRated = worstOrders
            .Select(o => new WorstRatedOrderDto(
                OrderId: o.Id,
                PublicCode: o.PublicCode,
                CompletedAt: o.CompletedAt!.Value,
                RatingStars: o.RatingStars!.Value,
                RatingComment: o.RatingComment,
                DriverName: o.DriverId.HasValue && driverNameMap.TryGetValue(o.DriverId.Value, out var name)
                    ? name : null))
            .ToList();

        return new RatingsAnalysisDto(
            TotalRated: totalRated,
            AvgRating: avgRating,
            Distribution: distribution,
            AvgTrend: avgTrend,
            WorstRated: worstRated);
    }

    // ── Internal SQL row types ────────────────────────────────────────────────

    /// <summary>Row shape for volume aggregate (total rides + revenue).</summary>
    private sealed record VolumeRow(int Rides, int Revenue);

    /// <summary>Row shape for the all-time first ride per identity (for new/returning classification).</summary>
    private sealed record IdentityFirstRideRow(string Identity, DateTimeOffset Firstride);

    /// <summary>Row shape for per-identity window aggregates (rides, revenue, user info).</summary>
    private sealed record WindowIdentityRow(
        string Identity,
        Guid? Userid,
        string? Phone,
        string? Name,
        int Windowrides,
        int Windowrevenue);

    /// <summary>In-memory enriched identity row with new/returning classification.</summary>
    private sealed record IdentityAggInfo(WindowIdentityRow Row, bool IsReturning);

    /// <summary>Row shape for per-bucket new-vs-returning raw data (bucket × identity × rides).</summary>
    private sealed record NewVsReturningRawRow(DateTime Bucket, string Identity, int Rides);

    /// <summary>Row shape for cohort triangle raw data (acq_month × act_month × count).</summary>
    private sealed record CohortRawRow(DateTime AcqMonth, DateTime ActMonth, int Count);

    /// <summary>Row shape for rating distribution (stars × count).</summary>
    private sealed record RatingDistRow(int Stars, int Count);

    /// <summary>Row shape for the avg-rating-per-bucket trend query.</summary>
    private sealed record RatingTrendRow(DateTime Bucket, int Count, double? Avgrating);

    /// <summary>Intermediate computed block used to share code between current and prior window.</summary>
    private sealed record ComputedBlock(
        int TotalRides,
        int TotalRevenueCzk,
        int NewIdentities,
        int ReturningIdentities,
        double RepeatRate,
        int FreqOne,
        int FreqTwoToFive,
        int FreqSixPlus,
        List<NewVsReturningBucketDto> NewVsReturningBuckets,
        List<CustomerCohortRowDto> CohortRows,
        List<TopCustomerDto> TopCustomers,
        RatingsAnalysisDto Ratings);
}

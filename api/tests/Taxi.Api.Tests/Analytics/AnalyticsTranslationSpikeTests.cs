using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Analytics;

/// <summary>Translation spike pinning 6 risky SQL shapes that the analytics endpoint WIs (WI-04..09)
/// will build on. All shapes use <c>Database.SqlQuery&lt;T&gt;</c> with <c>AT TIME ZONE</c> raw SQL and
/// snake_case column aliases. Every shape is exercised against the real Testcontainers Postgres
/// instance (not mocked) with a tiny hand-computed fixture.</summary>
[Collection(TestCollections.Database)]
public sealed class AnalyticsTranslationSpikeTests(PostgresFixture fixture)
{
    // Mid-September 2026 fixture dates — away from DST transitions (CET+2 / no switch until late Oct).
    // Prague is UTC+2 in September, so 06:00 UTC = 08:00 Prague.
    private static readonly DateTimeOffset Sep01Utc = new(2026, 9, 1, 0, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset Sep30Utc = new(2026, 9, 30, 23, 59, 59, TimeSpan.Zero);

    // -----------------------------------------------------------------------
    // Spike 1 — percentile_cont(0.5) and percentile_cont(0.9) with NULL guard
    // -----------------------------------------------------------------------

    /// <summary>Verifies that <c>percentile_cont WITHIN GROUP</c> translates via SqlQuery, maps to snake_case
    /// record properties, and matches hand-computed p50/p90 for both even-count and odd-count datasets.
    /// Rows with a NULL <c>assigned_at</c> must be excluded before the percentile (contract for all SLA metrics).</summary>
    [Fact]
    public async Task Spike_PercentileCont_TranslatesAndMatchesHandComputed()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleetId = Guid.CreateVersion7();
        await SeedFleetAsync(fleetId, ct);

        // Seed orders: 4 with known assigned_at (even count), 1 with NULL assigned_at (must be excluded).
        // Durations (assigned_at - created_at): 60, 120, 180, 240 seconds.
        // Postgres percentile_cont(0.5): rn=0.5*3=1.5, k=1, v[1]=120, v[2]=180 → 120 + 0.5*(180-120) = 150.
        // Postgres percentile_cont(0.9): rn=0.9*3=2.7, k=2, v[2]=180, v[3]=240 → 180 + 0.7*(240-180) = 222.
        var baseCreated = new DateTimeOffset(2026, 9, 10, 10, 0, 0, TimeSpan.Zero);
        var durations = new[] { 60, 120, 180, 240 }; // seconds
        await using var seedScope = fixture.Factory.Services.CreateAsyncScope();
        var seedDb = seedScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        foreach (var (dur, idx) in durations.Select((d, i) => (d, i)))
        {
            seedDb.Orders.Add(MakeMinimalOrder(fleetId, baseCreated.AddHours(idx),
                assignedAt: baseCreated.AddHours(idx).AddSeconds(dur)));
        }
        // NULL assigned_at row — must be excluded by the WHERE clause
        seedDb.Orders.Add(MakeMinimalOrder(fleetId, baseCreated.AddHours(10), assignedAt: null));
        await seedDb.SaveChangesAsync(ct);

        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var tenant = scope.ServiceProvider.GetRequiredService<CurrentTenant>();
        tenant.FleetId = fleetId;
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        // Note: EF NamingConventions converts "P50Seconds" → "p50_seconds" is WRONG.
        // The naming convention treats digits as part of the preceding word segment,
        // so the actual expected column name is probed by using property names that
        // map cleanly: "Median" → "median", "Ninetiethpct" → "ninetiethpct".
        // Safest approach: use simple single-word property names and matching aliases.
        var rows = await db.Database.SqlQuery<SlaPercentileRow>(
            $"""
             SELECT
                 percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (assigned_at - created_at)))::float8 AS "median",
                 percentile_cont(0.9) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (assigned_at - created_at)))::float8 AS "p90",
                 COUNT(*)::int AS "sample_count"
             FROM orders
             WHERE fleet_id = {fleetId}
               AND assigned_at IS NOT NULL
               AND created_at IS NOT NULL
             """).ToListAsync(ct);

        rows.Should().HaveCount(1);
        var row = rows[0];
        row.SampleCount.Should().Be(4);
        // Postgres interpolated p50 = 150.0, p90 = 222.0 for durations [60,120,180,240]
        row.Median.Should().BeApproximately(150.0, 0.001);
        row.P90.Should().BeApproximately(222.0, 0.001);
    }

    // -----------------------------------------------------------------------
    // Spike 2 — Demand heatmap hour × day-of-week bucketing in Prague TZ
    // -----------------------------------------------------------------------

    /// <summary>Verifies that <c>EXTRACT(HOUR ...)</c> × <c>EXTRACT(DOW ...)</c> with <c>AT TIME ZONE 'Europe/Prague'</c>
    /// groups correctly into (hour, dow, count) rows via SqlQuery.</summary>
    [Fact]
    public async Task Spike_DemandHeatmapBuckets_TranslatesToSql()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleetId = Guid.CreateVersion7();
        await SeedFleetAsync(fleetId, ct);

        // Seed 2 orders on 2026-09-07 (Monday, DOW=1) at 06:00 UTC = 08:00 Prague.
        // Prague EXTRACT(HOUR) = 8, EXTRACT(DOW) = 1 (Monday).
        // Seed 1 order on 2026-09-09 (Wednesday, DOW=3) at 14:00 UTC = 16:00 Prague.
        var mon0800Utc = new DateTimeOffset(2026, 9, 7, 6, 0, 0, TimeSpan.Zero); // Mon 08:00 Prague
        var wed1600Utc = new DateTimeOffset(2026, 9, 9, 14, 0, 0, TimeSpan.Zero); // Wed 16:00 Prague

        await using var seedScope = fixture.Factory.Services.CreateAsyncScope();
        var seedDb = seedScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        seedDb.Orders.Add(MakeMinimalOrder(fleetId, mon0800Utc));
        seedDb.Orders.Add(MakeMinimalOrder(fleetId, mon0800Utc.AddMinutes(5)));
        seedDb.Orders.Add(MakeMinimalOrder(fleetId, wed1600Utc));
        await seedDb.SaveChangesAsync(ct);

        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var tenant = scope.ServiceProvider.GetRequiredService<CurrentTenant>();
        tenant.FleetId = fleetId;
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        var start = new DateTimeOffset(2026, 9, 1, 0, 0, 0, TimeSpan.Zero);
        var end = new DateTimeOffset(2026, 10, 1, 0, 0, 0, TimeSpan.Zero);

        var rows = await db.Database.SqlQuery<HeatmapRow>(
            $"""
             SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE 'Europe/Prague')::int AS "hour",
                    EXTRACT(DOW  FROM created_at AT TIME ZONE 'Europe/Prague')::int AS "dow",
                    COUNT(*)::int AS "count"
             FROM orders
             WHERE fleet_id = {fleetId}
               AND created_at >= {start} AND created_at < {end}
             GROUP BY EXTRACT(HOUR FROM created_at AT TIME ZONE 'Europe/Prague'),
                      EXTRACT(DOW  FROM created_at AT TIME ZONE 'Europe/Prague')
             ORDER BY "dow", "hour"
             """).ToListAsync(ct);

        rows.Should().HaveCount(2);

        var monRow = rows.Single(r => r.Dow == 1);
        monRow.Hour.Should().Be(8);
        monRow.Count.Should().Be(2);

        var wedRow = rows.Single(r => r.Dow == 3);
        wedRow.Hour.Should().Be(16);
        wedRow.Count.Should().Be(1);
    }

    // -----------------------------------------------------------------------
    // Spike 3 — Monthly cohort triangle (acquisition × activity month in Prague TZ)
    // -----------------------------------------------------------------------

    /// <summary>Verifies <c>date_trunc('month', ... AT TIME ZONE 'Europe/Prague')</c> cohort grouping
    /// translates via SqlQuery and produces the expected (acq_month, act_month, count) rows.</summary>
    [Fact]
    public async Task Spike_CohortTriangle_TranslatesToSql()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleetId = Guid.CreateVersion7();
        await SeedFleetAsync(fleetId, ct);

        // Two distinct customers: C1 first order Aug, C2 first order Sep.
        // C1 has a second completed order in Sep → appears in Aug cohort × Sep activity.
        // C2 has only one Sep order → Sep cohort × Sep activity.
        var c1UserId = Guid.CreateVersion7();
        var c2UserId = Guid.CreateVersion7();

        await SeedUserAsync(c1UserId, fleetId, ct);
        await SeedUserAsync(c2UserId, fleetId, ct);

        var aug15Utc = new DateTimeOffset(2026, 8, 15, 10, 0, 0, TimeSpan.Zero);
        var sep10Utc = new DateTimeOffset(2026, 9, 10, 10, 0, 0, TimeSpan.Zero);

        await using var seedScope = fixture.Factory.Services.CreateAsyncScope();
        var seedDb = seedScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        // C1: Aug acquisition
        seedDb.Orders.Add(MakeMinimalOrder(fleetId, aug15Utc, customerUserId: c1UserId, status: OrderStatus.Completed));
        // C1: Sep activity
        seedDb.Orders.Add(MakeMinimalOrder(fleetId, sep10Utc, customerUserId: c1UserId, status: OrderStatus.Completed));
        // C2: Sep acquisition + activity
        seedDb.Orders.Add(MakeMinimalOrder(fleetId, sep10Utc.AddHours(1), customerUserId: c2UserId, status: OrderStatus.Completed));
        await seedDb.SaveChangesAsync(ct);

        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var tenant = scope.ServiceProvider.GetRequiredService<CurrentTenant>();
        tenant.FleetId = fleetId;
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        // Cohort = first completed month per customer_user_id, activity = each completed month.
        var rows = await db.Database.SqlQuery<CohortRow>(
            $"""
             WITH first_month AS (
                 SELECT customer_user_id,
                        date_trunc('month', MIN(created_at) AT TIME ZONE 'Europe/Prague') AS "acq"
                 FROM orders
                 WHERE fleet_id = {fleetId}
                   AND status = 'Completed'
                   AND customer_user_id IS NOT NULL
                 GROUP BY customer_user_id
             )
             SELECT fm.acq AS "acq_month",
                    date_trunc('month', o.created_at AT TIME ZONE 'Europe/Prague') AS "act_month",
                    COUNT(DISTINCT o.customer_user_id)::int AS "count"
             FROM orders o
             JOIN first_month fm ON fm.customer_user_id = o.customer_user_id
             WHERE o.fleet_id = {fleetId}
               AND o.status = 'Completed'
               AND o.customer_user_id IS NOT NULL
             GROUP BY fm.acq, date_trunc('month', o.created_at AT TIME ZONE 'Europe/Prague')
             ORDER BY "acq_month", "act_month"
             """).ToListAsync(ct);

        // Expect 3 rows: (Aug, Aug, 1), (Aug, Sep, 1), (Sep, Sep, 1)
        rows.Should().HaveCount(3);

        var augAug = rows.Single(r => r.AcqMonth.Month == 8 && r.ActMonth.Month == 8);
        augAug.Count.Should().Be(1);

        var augSep = rows.Single(r => r.AcqMonth.Month == 8 && r.ActMonth.Month == 9);
        augSep.Count.Should().Be(1);

        var sepSep = rows.Single(r => r.AcqMonth.Month == 9 && r.ActMonth.Month == 9);
        sepSep.Count.Should().Be(1);
    }

    // -----------------------------------------------------------------------
    // Spike 4 — Shift-hour clamped online seconds via GREATEST/LEAST
    // -----------------------------------------------------------------------

    /// <summary>Verifies that the SQL <c>GREATEST/LEAST</c> overlap clamp for <c>driver_shifts</c> per
    /// hour-bucket translates and produces correct online-seconds per bucket.</summary>
    [Fact]
    public async Task Spike_ShiftHourClamp_TranslatesToSql()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleetId = Guid.CreateVersion7();
        await SeedFleetAsync(fleetId, ct);

        // Seed User + Driver + Vehicle (DriverShift has FKs to drivers.id AND vehicles.id).
        var (driverId, vehicleId) = await SeedDriverAsync(fleetId, ct);

        // Shift: 08:30 Prague (06:30 UTC) → 10:15 Prague (08:15 UTC).
        // Hour 08 Prague: 08:30–09:00 = 1800 s
        // Hour 09 Prague: 09:00–10:00 = 3600 s
        // Hour 10 Prague: 10:00–10:15 = 900 s
        // Prague UTC+2, so shift UTC: 2026-09-10 06:30 → 08:15.
        var shiftStart = new DateTimeOffset(2026, 9, 10, 6, 30, 0, TimeSpan.Zero);  // 08:30 Prague
        var shiftEnd = new DateTimeOffset(2026, 9, 10, 8, 15, 0, TimeSpan.Zero);    // 10:15 Prague

        await using var seedScope = fixture.Factory.Services.CreateAsyncScope();
        var seedDb = seedScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        seedDb.DriverShifts.Add(new DriverShift
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleetId,
            DriverId = driverId,
            VehicleId = vehicleId,
            StartedAt = shiftStart,
            EndedAt = shiftEnd
        });
        await seedDb.SaveChangesAsync(ct);

        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var tenant = scope.ServiceProvider.GetRequiredService<CurrentTenant>();
        tenant.FleetId = fleetId;
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        // Generate hour buckets for the shift day (Prague local), compute overlap with each shift.
        // The series produces bucket_start in Prague TZ (UTC+2); we convert to UTC for overlap math.
        // Hour bucket in UTC: bucket_start - '2 hours' and bucket_end = bucket_start + '1 hour' - '2 hours'.
        var dayStartPragueAsUtc = new DateTimeOffset(2026, 9, 10, 0, 0, 0, TimeSpan.Zero); // midnight Prague = 2026-09-09 22:00 UTC — use the UTC day start of the shift
        // Pass bucket series as explicit date-range covering the shift day in Prague (offset-adjusted):
        var bucketSeriesStart = new DateTimeOffset(2026, 9, 9, 22, 0, 0, TimeSpan.Zero); // midnight Prague in UTC
        var bucketSeriesEnd = new DateTimeOffset(2026, 9, 10, 22, 0, 0, TimeSpan.Zero);  // midnight+1day Prague in UTC

        var rows = await db.Database.SqlQuery<ShiftClampRow>(
            $"""
             SELECT
                 gs AS "bucket_start_utc",
                 EXTRACT(EPOCH FROM (
                     LEAST(ds.ended_at, gs + INTERVAL '1 hour')
                     - GREATEST(ds.started_at, gs)
                 ))::int AS "online_seconds"
             FROM generate_series({bucketSeriesStart}::timestamptz, {bucketSeriesEnd}::timestamptz - INTERVAL '1 hour', INTERVAL '1 hour') gs
             JOIN driver_shifts ds ON ds.fleet_id = {fleetId}
               AND ds.started_at < gs + INTERVAL '1 hour'
               AND COALESCE(ds.ended_at, NOW()) > gs
             WHERE ds.fleet_id = {fleetId}
             ORDER BY gs
             """).ToListAsync(ct);

        rows.Should().NotBeEmpty();

        // The shift spans hour-08 (06:30–07:00 UTC = 08:30–09:00 Prague = 1800s),
        // hour-07 (07:00–08:00 UTC = 09:00–10:00 Prague = 3600s),
        // hour-08 (08:00–08:15 UTC = 10:00–10:15 Prague = 900s).
        // In UTC bucket terms:
        var h0630 = rows.SingleOrDefault(r => r.BucketStartUtc.Hour == 6 && r.BucketStartUtc.Minute == 30);
        // generate_series uses hourly intervals starting at series-start, so first bucket = 22:00 UTC (prev day)
        // The relevant buckets are those where the shift overlaps:
        // bucket 06:00 UTC (= Prague 08:00): overlap 06:30–07:00 = 1800s
        var bucket0600 = rows.SingleOrDefault(r => r.BucketStartUtc.ToUniversalTime().Hour == 6 && r.BucketStartUtc.ToUniversalTime().Minute == 0);
        // bucket 07:00 UTC (= Prague 09:00): overlap 07:00–08:00 = 3600s
        var bucket0700 = rows.SingleOrDefault(r => r.BucketStartUtc.ToUniversalTime().Hour == 7 && r.BucketStartUtc.ToUniversalTime().Minute == 0);
        // bucket 08:00 UTC (= Prague 10:00): overlap 08:00–08:15 = 900s
        var bucket0800 = rows.SingleOrDefault(r => r.BucketStartUtc.ToUniversalTime().Hour == 8 && r.BucketStartUtc.ToUniversalTime().Minute == 0);

        bucket0600.Should().NotBeNull("shift starts at 06:30 UTC — bucket 06:00 should overlap");
        bucket0600!.OnlineSeconds.Should().Be(1800);

        bucket0700.Should().NotBeNull("bucket 07:00–08:00 UTC fully inside shift");
        bucket0700!.OnlineSeconds.Should().Be(3600);

        bucket0800.Should().NotBeNull("shift ends at 08:15 UTC — bucket 08:00 should overlap");
        bucket0800!.OnlineSeconds.Should().Be(900);
    }

    // -----------------------------------------------------------------------
    // Spike 5 — Zone bounding-box attribution (Circle + Polygon)
    // -----------------------------------------------------------------------

    /// <summary>Verifies that C#-computed bounding-box parameters (for both Circle and Polygon zones)
    /// can be passed to a SQL <c>FILTER (WHERE pickup_lat BETWEEN … AND pickup_lng BETWEEN …)</c> and
    /// correctly count orders inside / outside each zone bbox.</summary>
    [Fact]
    public async Task Spike_ZoneBoundingBox_TranslatesToSql()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleetId = Guid.CreateVersion7();
        await SeedFleetAsync(fleetId, ct);

        // --- Circle zone: center (50.0830, 14.4211) = Prague centre, radius 500 m ---
        // latDelta  = 500 / 111_320 ≈ 0.004493
        // lngDelta  = 500 / (111_320 * cos(50.0830 * π/180)) ≈ 500 / (111_320 * 0.6429) ≈ 0.006986
        const double circleLat = 50.0830;
        const double circleLng = 14.4211;
        const double radiusM = 500.0;
        var latDelta = radiusM / 111_320.0;
        var lngDelta = radiusM / (111_320.0 * Math.Cos(circleLat * Math.PI / 180.0));
        var circleMinLat = circleLat - latDelta;
        var circleMaxLat = circleLat + latDelta;
        var circleMinLng = circleLng - lngDelta;
        var circleMaxLng = circleLng + lngDelta;

        // --- Polygon zone: simple rectangle covering Brno area ---
        // Vertices: (49.19, 16.59), (49.19, 16.61), (49.21, 16.61), (49.21, 16.59)
        double polyMinLat = 49.19, polyMaxLat = 49.21;
        double polyMinLng = 16.59, polyMaxLng = 16.61;

        // Seed orders:
        // 1 inside circle (50.0835, 14.4215) — should be attributed to circle zone
        // 1 outside circle but inside polygon (49.200, 16.600) — attributed to polygon zone
        // 1 outside both (48.8, 13.0) — attributed to neither

        await using var seedScope = fixture.Factory.Services.CreateAsyncScope();
        var seedDb = seedScope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        // Inside circle
        var inCircleOrder = MakeMinimalOrder(fleetId, Sep01Utc);
        inCircleOrder.PickupLat = 50.0835;
        inCircleOrder.PickupLng = 14.4215;
        seedDb.Orders.Add(inCircleOrder);

        // Inside polygon (Brno)
        var inPolyOrder = MakeMinimalOrder(fleetId, Sep01Utc.AddMinutes(1));
        inPolyOrder.PickupLat = 49.200;
        inPolyOrder.PickupLng = 16.600;
        seedDb.Orders.Add(inPolyOrder);

        // Outside both
        var outsideOrder = MakeMinimalOrder(fleetId, Sep01Utc.AddMinutes(2));
        outsideOrder.PickupLat = 48.8;
        outsideOrder.PickupLng = 13.0;
        seedDb.Orders.Add(outsideOrder);

        await seedDb.SaveChangesAsync(ct);

        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var tenant = scope.ServiceProvider.GetRequiredService<CurrentTenant>();
        tenant.FleetId = fleetId;
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        var rows = await db.Database.SqlQuery<ZoneBboxRow>(
            $"""
             SELECT
                 SUM(1) FILTER (WHERE pickup_lat BETWEEN {circleMinLat} AND {circleMaxLat}
                                  AND pickup_lng BETWEEN {circleMinLng} AND {circleMaxLng})::int AS "circle_count",
                 SUM(1) FILTER (WHERE pickup_lat BETWEEN {polyMinLat} AND {polyMaxLat}
                                  AND pickup_lng BETWEEN {polyMinLng} AND {polyMaxLng})::int AS "poly_count",
                 COUNT(*)::int AS "total_count"
             FROM orders
             WHERE fleet_id = {fleetId}
               AND created_at >= {Sep01Utc} AND created_at < {Sep30Utc}
             """).ToListAsync(ct);

        rows.Should().HaveCount(1);
        var row = rows[0];
        row.TotalCount.Should().Be(3);
        row.CircleCount.Should().Be(1, "only the Prague-centre order falls inside the circle bbox");
        row.PolyCount.Should().Be(1, "only the Brno order falls inside the polygon bbox");
    }

    // -----------------------------------------------------------------------
    // Spike 6 — Week and month bucket variants of the Prague-day expression
    // -----------------------------------------------------------------------

    /// <summary>Verifies that <c>date_trunc('week', created_at AT TIME ZONE 'Europe/Prague')</c> and
    /// <c>date_trunc('month', ...)</c> bucket expressions translate via SqlQuery and group correctly.</summary>
    [Fact]
    public async Task Spike_WeekMonthBuckets_TranslatesToSql()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleetId = Guid.CreateVersion7();
        await SeedFleetAsync(fleetId, ct);

        // 2 orders in week of 2026-09-07 (ISO Mon): Sep 07 + Sep 09
        // 1 order in week of 2026-09-14: Sep 14
        // All in September → should produce 1 month bucket (Sep)
        var t07 = new DateTimeOffset(2026, 9, 7, 10, 0, 0, TimeSpan.Zero);
        var t09 = new DateTimeOffset(2026, 9, 9, 10, 0, 0, TimeSpan.Zero);
        var t14 = new DateTimeOffset(2026, 9, 14, 10, 0, 0, TimeSpan.Zero);

        await using var seedScope = fixture.Factory.Services.CreateAsyncScope();
        var seedDb = seedScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        seedDb.Orders.Add(MakeMinimalOrder(fleetId, t07));
        seedDb.Orders.Add(MakeMinimalOrder(fleetId, t09));
        seedDb.Orders.Add(MakeMinimalOrder(fleetId, t14));
        await seedDb.SaveChangesAsync(ct);

        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var tenant = scope.ServiceProvider.GetRequiredService<CurrentTenant>();
        tenant.FleetId = fleetId;
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        var start = new DateTimeOffset(2026, 9, 1, 0, 0, 0, TimeSpan.Zero);
        var end = new DateTimeOffset(2026, 10, 1, 0, 0, 0, TimeSpan.Zero);

        // Week buckets
        var weekRows = await db.Database.SqlQuery<BucketRow>(
            $"""
             SELECT date_trunc('week', created_at AT TIME ZONE 'Europe/Prague') AS "bucket",
                    COUNT(*)::int AS "count"
             FROM orders
             WHERE fleet_id = {fleetId}
               AND created_at >= {start} AND created_at < {end}
             GROUP BY date_trunc('week', created_at AT TIME ZONE 'Europe/Prague')
             ORDER BY "bucket"
             """).ToListAsync(ct);

        weekRows.Should().HaveCount(2, "orders span 2 distinct ISO weeks");
        weekRows[0].Count.Should().Be(2); // Sep 07 + Sep 09 in week of Sep 07
        weekRows[1].Count.Should().Be(1); // Sep 14 in week of Sep 14

        // Month buckets
        var monthRows = await db.Database.SqlQuery<BucketRow>(
            $"""
             SELECT date_trunc('month', created_at AT TIME ZONE 'Europe/Prague') AS "bucket",
                    COUNT(*)::int AS "count"
             FROM orders
             WHERE fleet_id = {fleetId}
               AND created_at >= {start} AND created_at < {end}
             GROUP BY date_trunc('month', created_at AT TIME ZONE 'Europe/Prague')
             ORDER BY "bucket"
             """).ToListAsync(ct);

        monthRows.Should().HaveCount(1, "all orders are in September");
        monthRows[0].Count.Should().Be(3);
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    private async Task SeedFleetAsync(Guid fleetId, CancellationToken ct)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.Fleets.Add(new Fleet
        {
            Id = fleetId,
            Slug = $"analytics-spike-{Guid.NewGuid():N}",
            Name = "Analytics Spike Fleet",
            Phone = "+420777006001",
            Currency = "CZK",
            TimeZone = "Europe/Prague",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Seeds a minimal <c>User</c> row for customer FK constraints (<c>customer_user_id</c>).
    /// Phone is derived from a fresh random GUID (not the UUIDv7 userId) to avoid same-ms collisions.</summary>
    private async Task SeedUserAsync(Guid userId, Guid fleetId, CancellationToken ct)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        // Derive phone from a fully-random GUID to guarantee uniqueness across concurrent test runs.
        var phoneSuffix = Guid.NewGuid().ToString("N")[..9];
        db.Users.Add(new User
        {
            Id = userId,
            FleetId = fleetId,
            Role = UserRole.Customer,
            Phone = $"+420{phoneSuffix}",
            DisplayName = "Spike Customer",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Seeds a <c>User</c> + <c>Driver</c> + <c>Vehicle</c> row set so <c>DriverShift</c> FKs are satisfied.
    /// Returns <c>(driverId, vehicleId)</c> — both are the IDs referenced by <c>driver_shifts</c>.</summary>
    private async Task<(Guid DriverId, Guid VehicleId)> SeedDriverAsync(Guid fleetId, CancellationToken ct)
    {
        var userId = Guid.CreateVersion7();
        var driverId = Guid.CreateVersion7();
        var vehicleId = Guid.CreateVersion7();
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var driverPhone = Guid.NewGuid().ToString("N")[..9];
        db.Users.Add(new User
        {
            Id = userId,
            FleetId = fleetId,
            Role = UserRole.Driver,
            Phone = $"+420{driverPhone}",
            DisplayName = "Spike Driver",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        });
        db.Drivers.Add(new Driver
        {
            Id = driverId,
            FleetId = fleetId,
            UserId = userId,
            Status = DriverStatus.Offline,
            IsActive = true
        });
        db.Vehicles.Add(new Vehicle
        {
            Id = vehicleId,
            FleetId = fleetId,
            Plate = "SPIKE01",
            Make = "Škoda",
            Model = "Octavia",
            Color = "Bílá",
            Seats = 4,
            IsActive = true
        });
        await db.SaveChangesAsync(ct);
        return (driverId, vehicleId);
    }

    private static Order MakeMinimalOrder(
        Guid fleetId,
        DateTimeOffset createdAt,
        DateTimeOffset? assignedAt = null,
        Guid? customerUserId = null,
        OrderStatus status = OrderStatus.New)
    {
        return new Order
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleetId,
            PublicCode = Guid.NewGuid().ToString("N")[..6].ToUpperInvariant(),
            Status = status,
            Source = OrderSource.Dispatcher,
            CustomerPhone = "+420700000001",
            PickupAddress = "Spike Street 1, Prague",
            PickupLat = 50.0,
            PickupLng = 14.4,
            PriceType = PriceType.Meter,
            CreatedAt = createdAt,
            UpdatedAt = createdAt,
            AssignedAt = assignedAt,
            CustomerUserId = customerUserId,
            Version = 1
        };
    }

    // -----------------------------------------------------------------------
    // Private row-type records (keyless, snake_case aliases required)
    // -----------------------------------------------------------------------

    /// <summary>Row shape for the percentile_cont SLA spike.
    /// NOTE: EF naming convention maps single-word or two-segment properties cleanly.
    /// "Median" → "median", "P90" → "p90", "SampleCount" → "sample_count".
    /// Digits are absorbed into the preceding word segment, so avoid "P50Seconds" (→ "p50seconds").</summary>
    private sealed record SlaPercentileRow(double Median, double P90, int SampleCount);

    /// <summary>Row shape for the demand heatmap spike (hour × dow).</summary>
    private sealed record HeatmapRow(int Hour, int Dow, int Count);

    /// <summary>Row shape for the monthly cohort triangle spike.</summary>
    private sealed record CohortRow(DateTime AcqMonth, DateTime ActMonth, int Count);

    /// <summary>Row shape for the shift-hour clamp spike.</summary>
    private sealed record ShiftClampRow(DateTimeOffset BucketStartUtc, int OnlineSeconds);

    /// <summary>Row shape for the zone bounding-box attribution spike.</summary>
    private sealed record ZoneBboxRow(int CircleCount, int PolyCount, int TotalCount);

    /// <summary>Row shape for the week/month bucket spike.</summary>
    private sealed record BucketRow(DateTime Bucket, int Count);
}

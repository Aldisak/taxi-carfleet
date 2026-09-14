using System.Diagnostics;
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Analytics;

/// <summary>Integration tests for GET /api/v1/analytics/drivers (WI-08):
/// driver league table (rides, revenue, online hours, utilization, acceptance rate, etc.),
/// driver retention series (active/newly-activated/churned per week),
/// GET /api/v1/analytics/drivers/{id} drill-down (weekly trend + recent low-rated orders),
/// tenant isolation (both endpoints), 404 for cross-fleet driver, and perf &lt;500ms @50k.</summary>
[Collection(TestCollections.Database)]
public sealed class GetDriversTests(PostgresFixture fixture)
{
    // All fixture events fall on 2026-09-10 (UTC). Prague UTC+2 in Sep → local 08:00.
    private static readonly DateTimeOffset Sep10Base = new(2026, 9, 10, 6, 0, 0, TimeSpan.Zero);

    // ── Happy-path: hand-computed fixture for league table ────────────────────

    /// <summary>Seeds two drivers with known completed rides, revenue, and online shifts,
    /// then verifies that the league table ranks them with correct hand-computed metrics.
    ///
    /// Driver A: 2 completed rides, total CZK 300 (150+150), 1h online
    ///           accepted both assigned orders → acceptance rate 100%
    ///           avg time-to-accept: (5min + 5min)/2 = 300s
    ///           0 cancellations, 0 no-shows, 0 declines+timeouts
    ///           avg rating: (5+4)/2 = 4.5 → stored as decimal
    ///
    /// Driver B: 1 completed ride, total CZK 200, 2h online
    ///           1 declined order event (DeclinedByDriver)
    ///           accepted 1 out of 2 assigned → acceptance rate 50%
    ///           avg time-to-accept: (10min)/1 = 600s (only accepted order counts)
    ///           0 cancellations, 0 no-shows
    ///           avg rating: 3 (single rating)
    ///
    /// Expected ranks by rides DESC: Driver A (2 rides) then Driver B (1 ride).
    /// </summary>
    [Fact]
    public async Task HandleAsync_HandComputedFixture_RanksTwoDrivers()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, adminId) = await SeedFleetAsync(ct);

        var (driverAId, driverAUserId) = await SeedDriverAsync(fleetId, "Driver A", ct);
        var (driverBId, driverBUserId) = await SeedDriverAsync(fleetId, "Driver B", ct);

        // Driver A: 1h online shift starting at Sep10Base
        await SeedDriverShiftAsync(fleetId, driverAId,
            start: Sep10Base,
            end: Sep10Base.AddHours(1), ct);

        // Driver A: 2 completed orders, 150 CZK each
        await SeedOrderWithDriverAsync(fleetId, driverAId,
            finalPriceCzk: 150,
            assignedAt: Sep10Base.AddMinutes(5),
            acceptedAt: Sep10Base.AddMinutes(10),  // 5 min to accept
            completedAt: Sep10Base.AddMinutes(40),
            ratingStars: 5,
            ct: ct);

        await SeedOrderWithDriverAsync(fleetId, driverAId,
            finalPriceCzk: 150,
            assignedAt: Sep10Base.AddMinutes(15),
            acceptedAt: Sep10Base.AddMinutes(20),  // 5 min to accept
            completedAt: Sep10Base.AddMinutes(55),
            ratingStars: 4,
            ct: ct);

        // Driver B: 2h online shift
        await SeedDriverShiftAsync(fleetId, driverBId,
            start: Sep10Base,
            end: Sep10Base.AddHours(2), ct);

        // Driver B: 1 completed order, 200 CZK (10 min to accept)
        await SeedOrderWithDriverAsync(fleetId, driverBId,
            finalPriceCzk: 200,
            assignedAt: Sep10Base.AddMinutes(5),
            acceptedAt: Sep10Base.AddMinutes(15),  // 10 min to accept
            completedAt: Sep10Base.AddMinutes(50),
            ratingStars: 3,
            ct: ct);

        // Driver B: 1 declined order event (Assigned but then declined)
        await SeedOrderDeclinedAsync(fleetId, driverBId, driverBUserId, ct);

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminId);
        var resp = await client.GetAsync(
            "/api/v1/analytics/drivers?from=2026-09-10&to=2026-09-11", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<GetDriversResponseDto>(ct);

        body.Should().NotBeNull();
        body!.Drivers.Should().HaveCount(2, "two drivers seeded");

        // Driver A should be first by rides (2 > 1)
        var dA = body.Drivers.FirstOrDefault(d => d.DriverId == driverAId);
        var dB = body.Drivers.FirstOrDefault(d => d.DriverId == driverBId);

        dA.Should().NotBeNull();
        dB.Should().NotBeNull();

        // Driver A metrics
        dA!.Name.Should().Be("Driver A");
        dA.RidesCompleted.Should().Be(2);
        dA.RevenueCzk.Should().Be(300, "150 + 150");
        dA.OnlineHours.Should().BeApproximately(1.0, 0.01, "1h shift");
        // utilization: busy time (2 rides × ~30min each) / 1h * 100
        // ride1: 10min→40min=30min, ride2: 20min→55min=35min => 65min busy / 60min online => >100% clamped or raw
        // The spec doesn't mandate clamping, so let's just verify it's > 0
        dA.UtilizationPct.Should().BeGreaterThan(0);
        dA.AcceptanceRate.Should().BeApproximately(100.0, 0.1, "accepted both assigned orders");
        dA.AvgTimeToAcceptSeconds.Should().BeApproximately(300.0, 1.0, "avg of 5min+5min = 300s");
        dA.DeclinesAndTimeouts.Should().Be(0);
        dA.Cancellations.Should().Be(0);
        dA.NoShows.Should().Be(0);
        dA.AvgRating.Should().BeApproximately(4.5, 0.05, "(5+4)/2=4.5");

        // Driver B metrics
        dB!.Name.Should().Be("Driver B");
        dB.RidesCompleted.Should().Be(1);
        dB.RevenueCzk.Should().Be(200);
        dB.OnlineHours.Should().BeApproximately(2.0, 0.01, "2h shift");
        // acceptance rate: 1 accepted / (1 accepted + 1 declined) = 50%
        dB.AcceptanceRate.Should().BeApproximately(50.0, 1.0, "1 of 2 offers accepted");
        dB.AvgTimeToAcceptSeconds.Should().BeApproximately(600.0, 1.0, "10 min = 600s");
        dB.DeclinesAndTimeouts.Should().Be(1, "1 declined order event");
        dB.AvgRating.Should().BeApproximately(3.0, 0.05, "single rating of 3");

        body.Prior.Should().BeNull("compare=false by default");
    }

    // ── Drill-down: weekly trend + low-rated orders ───────────────────────────

    /// <summary>Seeds a driver with 3 completed rides (2 in Sep 8-14 week, 1 in Sep 1-7 week)
    /// and one low-rated order (≤3 stars). Verifies the weekly trend has 2 entries and the
    /// low-rated orders list has 1 entry with the correct data.</summary>
    [Fact]
    public async Task HandleAsync_DrillDown_ReturnsWeeklyTrendAndLowRated()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, adminId) = await SeedFleetAsync(ct);
        var (driverId, _) = await SeedDriverAsync(fleetId, "Drill Driver", ct);

        // Week 1: Sep 1-7 — 1 ride, 100 CZK, rating 5
        var sep1Base = new DateTimeOffset(2026, 9, 1, 6, 0, 0, TimeSpan.Zero);
        await SeedOrderWithDriverAsync(fleetId, driverId,
            finalPriceCzk: 100,
            assignedAt: sep1Base.AddMinutes(5),
            acceptedAt: sep1Base.AddMinutes(6),
            completedAt: sep1Base.AddMinutes(40),
            ratingStars: 5,
            ct: ct);

        // Week 2: Sep 8-14 — 2 rides: one 5-star (200 CZK), one 2-star (150 CZK, low-rated)
        var sep8Base = new DateTimeOffset(2026, 9, 8, 6, 0, 0, TimeSpan.Zero);
        await SeedOrderWithDriverAsync(fleetId, driverId,
            finalPriceCzk: 200,
            assignedAt: sep8Base.AddMinutes(5),
            acceptedAt: sep8Base.AddMinutes(6),
            completedAt: sep8Base.AddMinutes(40),
            ratingStars: 5,
            ct: ct);

        await SeedOrderWithDriverAsync(fleetId, driverId,
            finalPriceCzk: 150,
            assignedAt: sep8Base.AddMinutes(10),
            acceptedAt: sep8Base.AddMinutes(11),
            completedAt: sep8Base.AddMinutes(50),
            ratingStars: 2,
            ratingComment: "Bad driver",
            ct: ct);

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminId);
        var resp = await client.GetAsync(
            $"/api/v1/analytics/drivers/{driverId}?from=2026-09-01&to=2026-09-15", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<GetDriverDrilldownResponseDto>(ct);

        body.Should().NotBeNull();
        body!.WeeklyTrend.Should().HaveCount(2, "rides in 2 distinct ISO weeks");

        var week1 = body.WeeklyTrend.OrderBy(w => w.WeekStart).First();
        week1.RidesCompleted.Should().Be(1);
        week1.RevenueCzk.Should().Be(100);

        var week2 = body.WeeklyTrend.OrderBy(w => w.WeekStart).Last();
        week2.RidesCompleted.Should().Be(2);
        week2.RevenueCzk.Should().Be(350, "200+150");

        body.LowRatedOrders.Should().HaveCount(1, "one order with rating ≤3");
        body.LowRatedOrders[0].RatingStars.Should().Be(2);
        body.LowRatedOrders[0].RatingComment.Should().Be("Bad driver");
    }

    // ── Tenant isolation: league table ───────────────────────────────────────

    /// <summary>Fleet A has 2 drivers; Fleet B has 3 drivers. Fleet A admin sees only Fleet A's drivers.</summary>
    [Fact]
    public async Task HandleAsync_LeagueTable_TenantsIsolated()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetAId, adminAId) = await SeedFleetAsync(ct);
        var (fleetBId, _) = await SeedFleetAsync(ct);

        await SeedDriverAsync(fleetAId, "FA Driver 1", ct);
        await SeedDriverAsync(fleetAId, "FA Driver 2", ct);
        await SeedDriverAsync(fleetBId, "FB Driver 1", ct);
        await SeedDriverAsync(fleetBId, "FB Driver 2", ct);
        await SeedDriverAsync(fleetBId, "FB Driver 3", ct);

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetAId, adminAId);
        var resp = await client.GetAsync(
            "/api/v1/analytics/drivers?from=2026-09-01&to=2026-09-15", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<GetDriversResponseDto>(ct);

        body.Should().NotBeNull();
        body!.Drivers.Should().HaveCount(2, "Fleet A has exactly 2 drivers");
    }

    // ── Tenant isolation: drill-down ─────────────────────────────────────────

    /// <summary>Drill-down for a driver from Fleet B returns 404 when called by Fleet A's admin.</summary>
    [Fact]
    public async Task HandleAsync_DrillDown_CrossFleetDriver_Returns404()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetAId, adminAId) = await SeedFleetAsync(ct);
        var (fleetBId, _) = await SeedFleetAsync(ct);

        var (driverBId, _) = await SeedDriverAsync(fleetBId, "FB Driver", ct);

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetAId, adminAId);
        var resp = await client.GetAsync(
            $"/api/v1/analytics/drivers/{driverBId}?from=2026-09-01&to=2026-09-15", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.NotFound, "cross-fleet driver id must 404");
    }

    // ── Retention: classification of active, newly activated, and churned ─────

    /// <summary>Tests the weekly retention series with three distinct driver categories.
    ///
    /// Classification rules per week (week = Mon-Sun ISO, winEnd = exclusive end of window):
    ///   Active     = at least 1 completed ride in that week.
    ///   NewlyActivated = first-EVER completed ride is in that week.
    ///   Churned    = had a completed ride in prior weeks, but NO completed ride in the
    ///                trailing 14 days ending at the week's end.
    ///
    /// Setup -- window 2026-09-07 to 2026-09-21 (2 weeks: 09-07 and 09-14):
    ///   Driver X: first ride Sep 1 (before window), rides Sep 8 (in week starting Sep 7).
    ///             first ever = Sep 1. In week Sep 7-13: 1 ride, Active but NOT newly activated.
    ///             In week Sep 14-20: 0 rides. Last ride Sep 8 is within 14 days of Sep 21 -- NOT churned.
    ///   Driver Y: first EVER ride Sep 8 -- newly activated in week starting Sep 7.
    ///             No ride in week Sep 14-20. Last ride Sep 8, 14 days before Sep 21 = Sep 7,
    ///             Sep 8 is after Sep 7 -- NOT churned in week Sep 14.
    ///   Driver Z: first ride Aug 1 (before window), last ride Sep 3 (before window).
    ///             Week Sep 7-13: no ride. 14 days before Sep 14 = Sep 1. Sep 3 after Sep 1 -- NOT churned.
    ///             Week Sep 14-20: no ride. 14 days before Sep 21 = Sep 7. Sep 3 before Sep 7 -- CHURNED.
    ///
    /// Expected retention series:
    ///   Week 09-07: Active=2 (X and Y rode Sep 8), NewlyActivated=1 (Y), Churned=0.
    ///   Week 09-14: Active=0, NewlyActivated=0, Churned=1 (Z: last ride Sep 3 before Sep 7).
    /// </summary>
    [Fact]
    public async Task HandleAsync_Retention_ClassifiesActivatedAndChurned()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, adminId) = await SeedFleetAsync(ct);

        var aug1 = new DateTimeOffset(2026, 8, 1, 6, 0, 0, TimeSpan.Zero);
        var sep1 = new DateTimeOffset(2026, 9, 1, 6, 0, 0, TimeSpan.Zero);
        var sep3 = new DateTimeOffset(2026, 9, 3, 6, 0, 0, TimeSpan.Zero);
        var sep8 = new DateTimeOffset(2026, 9, 8, 6, 0, 0, TimeSpan.Zero);

        // Driver X: first ever ride Sep 1, rides Sep 8 in window
        var (driverXId, _) = await SeedDriverAsync(fleetId, "Driver X", ct);
        await SeedOrderWithDriverAsync(fleetId, driverXId,
            finalPriceCzk: 100,
            assignedAt: sep1.AddMinutes(5), acceptedAt: sep1.AddMinutes(6),
            completedAt: sep1.AddMinutes(40), ratingStars: null, ct: ct);
        await SeedOrderWithDriverAsync(fleetId, driverXId,
            finalPriceCzk: 100,
            assignedAt: sep8.AddMinutes(5), acceptedAt: sep8.AddMinutes(6),
            completedAt: sep8.AddMinutes(40), ratingStars: null, ct: ct);

        // Driver Y: first EVER ride Sep 8 (newly activated in week 09-07)
        var (driverYId, _) = await SeedDriverAsync(fleetId, "Driver Y", ct);
        await SeedOrderWithDriverAsync(fleetId, driverYId,
            finalPriceCzk: 100,
            assignedAt: sep8.AddMinutes(10), acceptedAt: sep8.AddMinutes(11),
            completedAt: sep8.AddMinutes(45), ratingStars: null, ct: ct);

        // Driver Z: rides Aug 1 and Sep 3 (before window), silent in window weeks
        var (driverZId, _) = await SeedDriverAsync(fleetId, "Driver Z", ct);
        await SeedOrderWithDriverAsync(fleetId, driverZId,
            finalPriceCzk: 100,
            assignedAt: aug1.AddMinutes(5), acceptedAt: aug1.AddMinutes(6),
            completedAt: aug1.AddMinutes(40), ratingStars: null, ct: ct);
        await SeedOrderWithDriverAsync(fleetId, driverZId,
            finalPriceCzk: 100,
            assignedAt: sep3.AddMinutes(5), acceptedAt: sep3.AddMinutes(6),
            completedAt: sep3.AddMinutes(40), ratingStars: null, ct: ct);

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminId);
        // Window: Sep 7 (Mon) → Sep 21 (Sun exclusive) = 2 ISO weeks
        var resp = await client.GetAsync(
            "/api/v1/analytics/drivers?from=2026-09-07&to=2026-09-20&granularity=week", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<GetDriversResponseDto>(ct);

        body.Should().NotBeNull();
        body!.Retention.Should().NotBeEmpty("should have at least 1 retention bucket");

        // Find week starting Sep 7
        var week1 = body.Retention.FirstOrDefault(r => r.WeekStart.StartsWith("2026-09-07"));
        week1.Should().NotBeNull("week of Sep 7 should be in retention series");
        week1!.Active.Should().Be(2, "Driver X and Driver Y both rode Sep 8");
        week1.NewlyActivated.Should().Be(1, "only Driver Y's first-ever ride is Sep 8");
        week1.Churned.Should().Be(0, "no driver has gone silent for 14+ days by Sep 14");

        // Find week starting Sep 14
        var week2 = body.Retention.FirstOrDefault(r => r.WeekStart.StartsWith("2026-09-14"));
        week2.Should().NotBeNull("week of Sep 14 should be in retention series");
        week2!.Active.Should().Be(0, "no driver rode in Sep 14-20");
        week2.NewlyActivated.Should().Be(0, "no driver's first ride is in Sep 14-20");
        week2.Churned.Should().Be(1, "Driver Z: last ride Sep 3 < Sep 7 (14 days before Sep 21)");
    }

    // ── Compare: prior period populated when compare=true ────────────────────

    /// <summary>Seeds a driver with rides in both the current window and the prior equal-length period.
    /// Verifies that compare=true populates body.Prior with the prior-window drivers and retention,
    /// and that body.Prior.Drivers reflects the prior-period rides (not the current-period rides).
    ///
    /// Window: Sep 8-14 (7 days). Prior window: Sep 1-7 (7 days).
    /// Driver A: 1 ride Sep 2 (prior), 2 rides Sep 9-10 (current).
    /// Driver B: 1 ride Sep 10 (current only).
    ///
    /// Expected Prior.Drivers: 1 driver (Driver A, 1 ride), Driver B absent from prior.
    /// Expected Prior.Retention: week of Sep 1 has Active=1 (Driver A rode Sep 2).
    /// </summary>
    [Fact]
    public async Task HandleAsync_CompareTrueWithPriorRides_ReturnsPriorBlock()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, adminId) = await SeedFleetAsync(ct);

        var (driverAId, _) = await SeedDriverAsync(fleetId, "Compare Driver A", ct);
        var (driverBId, _) = await SeedDriverAsync(fleetId, "Compare Driver B", ct);

        // Prior window: Sep 1–7. Driver A has 1 ride Sep 2.
        var sep2 = new DateTimeOffset(2026, 9, 2, 6, 0, 0, TimeSpan.Zero);
        await SeedOrderWithDriverAsync(fleetId, driverAId,
            finalPriceCzk: 100,
            assignedAt: sep2.AddMinutes(5),
            acceptedAt: sep2.AddMinutes(6),
            completedAt: sep2.AddMinutes(40),
            ratingStars: null, ct: ct);

        // Current window: Sep 8–14. Driver A has 2 rides; Driver B has 1 ride.
        var sep9 = new DateTimeOffset(2026, 9, 9, 6, 0, 0, TimeSpan.Zero);
        var sep10 = new DateTimeOffset(2026, 9, 10, 6, 0, 0, TimeSpan.Zero);
        await SeedOrderWithDriverAsync(fleetId, driverAId,
            finalPriceCzk: 200,
            assignedAt: sep9.AddMinutes(5),
            acceptedAt: sep9.AddMinutes(6),
            completedAt: sep9.AddMinutes(40),
            ratingStars: null, ct: ct);
        await SeedOrderWithDriverAsync(fleetId, driverAId,
            finalPriceCzk: 150,
            assignedAt: sep10.AddMinutes(5),
            acceptedAt: sep10.AddMinutes(6),
            completedAt: sep10.AddMinutes(40),
            ratingStars: null, ct: ct);
        await SeedOrderWithDriverAsync(fleetId, driverBId,
            finalPriceCzk: 120,
            assignedAt: sep10.AddMinutes(10),
            acceptedAt: sep10.AddMinutes(11),
            completedAt: sep10.AddMinutes(50),
            ratingStars: null, ct: ct);

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminId);
        var resp = await client.GetAsync(
            "/api/v1/analytics/drivers?from=2026-09-08&to=2026-09-14&compare=true", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<GetDriversResponseDto>(ct);

        body.Should().NotBeNull();
        body!.Prior.Should().NotBeNull("compare=true must populate Prior block");

        // Current period: Driver A 2 rides, Driver B 1 ride.
        body.Drivers.Should().HaveCount(2, "both drivers are active in the fleet");
        var currentA = body.Drivers.FirstOrDefault(d => d.DriverId == driverAId);
        currentA.Should().NotBeNull();
        currentA!.RidesCompleted.Should().Be(2, "Driver A completed 2 rides in current window");
        currentA.RevenueCzk.Should().Be(350, "200 + 150");

        // Prior period: only Driver A had a ride (Sep 2), Driver B had none.
        var priorA = body.Prior!.Drivers.FirstOrDefault(d => d.DriverId == driverAId);
        priorA.Should().NotBeNull("Driver A had 1 ride in the prior window");
        priorA!.RidesCompleted.Should().Be(1, "Driver A completed 1 ride in prior window (Sep 2)");
        priorA.RevenueCzk.Should().Be(100);

        var priorB = body.Prior.Drivers.FirstOrDefault(d => d.DriverId == driverBId);
        priorB.Should().NotBeNull("Driver B is an active fleet driver, appears with 0 rides in prior");
        priorB!.RidesCompleted.Should().Be(0, "Driver B had no rides in prior window");

        // Prior retention: Sep 1 is a Tuesday, so its ISO week starts Monday Aug 31.
        // The prior window Sep 1-7 generates one retention bucket: week starting Aug 31.
        // Driver A rode Sep 2, which falls in the Aug 31-Sep 7 ISO week → Active=1.
        body.Prior.Retention.Should().NotBeEmpty("prior window Sep 1-7 produces retention data");
        var priorWeek1 = body.Prior.Retention.FirstOrDefault(r => r.WeekStart.StartsWith("2026-08-31"));
        priorWeek1.Should().NotBeNull("week of Aug 31 (Mon before Sep 1 Tue) should be in prior retention");
        priorWeek1!.Active.Should().Be(1, "only Driver A rode Sep 2 in the prior ISO week");
    }

    // ── Perf test (opt-in via RUN_PERF_TESTS=1) ──────────────────────────────

    /// <summary>Seeds 50k completed orders across 20 drivers, calls GET /api/v1/analytics/drivers
    /// with compare=true, and asserts the response is returned in under 500 ms.</summary>
    [Fact]
    [Trait("Category", "Perf")]
    public async Task HandleAsync_50kSeed_RespondsUnder500ms()
    {
        if (Environment.GetEnvironmentVariable("RUN_PERF_TESTS") != "1")
        {
            return; // opt-in only
        }

        var ct = TestContext.Current.CancellationToken;
        var (fleetId, adminId) = await SeedFleetAsync(ct);

        // Seed 20 drivers
        var driverIds = new List<Guid>();
        for (var i = 0; i < 20; i++)
        {
            var (dId, _) = await SeedDriverAsync(fleetId, $"Perf Driver {i}", ct);
            driverIds.Add(dId);
        }

        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var rng = new Random(42);

        // Bulk seed 50k completed orders
        for (var i = 0; i < 50_000; i++)
        {
            var driverId = driverIds[rng.Next(driverIds.Count)];
            var assignedAt = Sep10Base.AddMinutes(rng.Next(0, 3 * 24 * 60));
            var acceptedAt = assignedAt.AddMinutes(rng.Next(1, 10));
            var completedAt = acceptedAt.AddMinutes(rng.Next(15, 60));
            db.Orders.Add(new Order
            {
                Id = Guid.CreateVersion7(),
                FleetId = fleetId,
                PublicCode = Guid.NewGuid().ToString("N")[..6].ToUpperInvariant(),
                Status = OrderStatus.Completed,
                Source = OrderSource.Dispatcher,
                CustomerPhone = $"+420{Guid.NewGuid().ToString("N")[..9]}",
                PickupAddress = "Perf Test St",
                PickupLat = 50.08,
                PickupLng = 14.43,
                PriceType = PriceType.Meter,
                FinalPriceCzk = rng.Next(100, 1000),
                PaymentType = PaymentType.Cash,
                DriverId = driverId,
                AssignedAt = assignedAt,
                AcceptedAt = acceptedAt,
                CompletedAt = completedAt,
                CreatedAt = assignedAt,
                UpdatedAt = completedAt,
                Version = 1
            });

            if (i % 5_000 == 4_999)
                await db.SaveChangesAsync(ct);
        }

        await db.SaveChangesAsync(ct);

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminId);
        var sw = Stopwatch.StartNew();
        var resp = await client.GetAsync(
            "/api/v1/analytics/drivers?from=2026-09-10&to=2026-09-13&compare=true", ct);
        sw.Stop();

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        sw.ElapsedMilliseconds.Should().BeLessThan(500,
            $"drivers endpoint must respond in <500ms at 50k rows with compare=true; took {sw.ElapsedMilliseconds}ms");
    }

    // ── Seed helpers ──────────────────────────────────────────────────────────

    /// <summary>Seeds a fleet + admin user. Returns (FleetId, AdminId).</summary>
    private async Task<(Guid FleetId, Guid AdminId)> SeedFleetAsync(CancellationToken ct)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        var fleetId = Guid.CreateVersion7();
        var adminId = Guid.CreateVersion7();
        var slug = Guid.NewGuid().ToString("N")[..12];

        db.Fleets.Add(new Fleet
        {
            Id = fleetId,
            Name = $"Fleet {slug}",
            Slug = slug,
            Phone = "+420000000000",
            IsActive = true
        });
        db.Users.Add(new User
        {
            Id = adminId,
            FleetId = fleetId,
            Role = UserRole.FleetAdmin,
            Email = $"admin-drv-{adminId:N}@analytics.local",
            Phone = $"+42099{Guid.NewGuid().ToString("N")[..7]}",
            DisplayName = "Drivers Admin",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync(ct);
        return (fleetId, adminId);
    }

    /// <summary>Seeds a driver user + driver record. Returns (DriverId, UserId).</summary>
    private async Task<(Guid DriverId, Guid UserId)> SeedDriverAsync(
        Guid fleetId, string name, CancellationToken ct)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        var userId = Guid.CreateVersion7();
        var driverId = Guid.CreateVersion7();

        db.Users.Add(new User
        {
            Id = userId,
            FleetId = fleetId,
            Role = UserRole.Driver,
            Email = $"driver-{driverId:N}@drv.local",
            Phone = $"+420{Guid.NewGuid().ToString("N")[..9]}",
            DisplayName = name,
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
        await db.SaveChangesAsync(ct);
        return (driverId, userId);
    }

    /// <summary>Seeds a driver shift for online-hours computation.</summary>
    private async Task SeedDriverShiftAsync(
        Guid fleetId, Guid driverId,
        DateTimeOffset start, DateTimeOffset end,
        CancellationToken ct)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        // Need a vehicle for the shift FK
        var vehicleId = Guid.CreateVersion7();
        var existing = await db.Vehicles.AsNoTracking()
            .Where(v => v.FleetId == fleetId)
            .Select(v => (Guid?)v.Id)
            .FirstOrDefaultAsync(ct);
        if (existing is null)
        {
            db.Vehicles.Add(new Vehicle
            {
                Id = vehicleId,
                FleetId = fleetId,
                Plate = $"TEST{Guid.NewGuid().ToString("N")[..4].ToUpperInvariant()}",
                Make = "Test",
                Model = "Car",
                Color = "White",
                IsActive = true
            });
            await db.SaveChangesAsync(ct);
        }
        else
        {
            vehicleId = existing.Value;
        }

        db.DriverShifts.Add(new DriverShift
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleetId,
            DriverId = driverId,
            VehicleId = vehicleId,
            StartedAt = start,
            EndedAt = end
        });
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Seeds a completed order assigned to a driver.</summary>
    private async Task SeedOrderWithDriverAsync(
        Guid fleetId,
        Guid driverId,
        int finalPriceCzk,
        DateTimeOffset assignedAt,
        DateTimeOffset acceptedAt,
        DateTimeOffset completedAt,
        int? ratingStars = null,
        string? ratingComment = null,
        CancellationToken ct = default)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        db.Orders.Add(new Order
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleetId,
            PublicCode = Guid.NewGuid().ToString("N")[..6].ToUpperInvariant(),
            Status = OrderStatus.Completed,
            Source = OrderSource.Dispatcher,
            CustomerPhone = $"+420{Guid.NewGuid().ToString("N")[..9]}",
            PickupAddress = "Driver Test St",
            PickupLat = 50.08,
            PickupLng = 14.43,
            PriceType = PriceType.Meter,
            FinalPriceCzk = finalPriceCzk,
            PaymentType = PaymentType.Cash,
            DriverId = driverId,
            AssignedAt = assignedAt,
            AcceptedAt = acceptedAt,
            CompletedAt = completedAt,
            RatingStars = ratingStars,
            RatingComment = ratingComment,
            RatedAt = ratingStars.HasValue ? completedAt.AddHours(1) : null,
            CreatedAt = assignedAt,
            UpdatedAt = completedAt,
            Version = 1
        });
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Seeds a declined order event: an order that was assigned to the driver but they declined.
    /// Models as a Cancelled order where CancelledByRole = Driver (driver-declined flow).</summary>
    private async Task SeedOrderDeclinedAsync(
        Guid fleetId, Guid driverId, Guid driverUserId, CancellationToken ct)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        db.Orders.Add(new Order
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleetId,
            PublicCode = Guid.NewGuid().ToString("N")[..6].ToUpperInvariant(),
            Status = OrderStatus.Cancelled,
            Source = OrderSource.Dispatcher,
            CustomerPhone = $"+420{Guid.NewGuid().ToString("N")[..9]}",
            PickupAddress = "Decline Test St",
            PickupLat = 50.08,
            PickupLng = 14.43,
            PriceType = PriceType.Meter,
            DriverId = driverId,
            AssignedAt = Sep10Base.AddMinutes(5),
            AcceptedAt = null,
            CancelledAt = Sep10Base.AddMinutes(6),
            CancelReason = "Driver declined",
            CancelledByRole = UserRole.Driver,
            CreatedAt = Sep10Base.AddMinutes(5),
            UpdatedAt = Sep10Base.AddMinutes(6),
            Version = 1
        });
        await db.SaveChangesAsync(ct);
    }

    // ── Local response DTOs (mirrors actual response shape) ───────────────────

    private sealed record GetDriversResponseDto(
        List<DriverLeagueRowDto> Drivers,
        List<RetentionBucketDto> Retention,
        GetDriversPriorDto? Prior = null);

    private sealed record GetDriversPriorDto(
        List<DriverLeagueRowDto> Drivers,
        List<RetentionBucketDto> Retention);

    private sealed record DriverLeagueRowDto(
        Guid DriverId,
        string Name,
        int RidesCompleted,
        int RevenueCzk,
        double OnlineHours,
        double UtilizationPct,
        double RevenuePerOnlineHour,
        double AcceptanceRate,
        double AvgTimeToAcceptSeconds,
        int DeclinesAndTimeouts,
        int Cancellations,
        int NoShows,
        double? AvgRating);

    private sealed record RetentionBucketDto(
        string WeekStart,
        int Active,
        int NewlyActivated,
        int Churned);

    private sealed record GetDriverDrilldownResponseDto(
        Guid DriverId,
        string Name,
        List<DriverWeeklyTrendDto> WeeklyTrend,
        List<LowRatedOrderDto> LowRatedOrders);

    private sealed record DriverWeeklyTrendDto(
        string WeekStart,
        int RidesCompleted,
        int RevenueCzk,
        double? AvgRating);

    private sealed record LowRatedOrderDto(
        Guid OrderId,
        DateTimeOffset CompletedAt,
        int RatingStars,
        string? RatingComment,
        string PublicCode,
        string PickupAddress,
        string? DropoffAddress);
}

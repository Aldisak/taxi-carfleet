using System.Diagnostics;
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Infrastructure.Seed;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Analytics;

/// <summary>Integration tests for GET /api/v1/analytics/overview (WI-04):
/// hand-computed KPI fixture, compare-period deltas, tenant isolation, perf &lt;500 ms @ 50k.</summary>
[Collection(TestCollections.Database)]
public sealed class GetOverviewTests(PostgresFixture fixture)
{
    // All fixture orders fall on 2026-09-10 in Prague time (UTC+2 in September).
    // Sep10PragueAsUtc = 2026-09-10 06:00 UTC (= 08:00 Prague local) — safely within the Prague calendar day.
    // We query from=2026-09-10 to=2026-09-10 which window in UTC is Sep10 00:00 UTC+2 → Sep11 00:00 UTC+2
    // = Sep09 22:00 UTC → Sep10 22:00 UTC.
    private static readonly DateTimeOffset Sep10PragueAsUtc = new(2026, 9, 10, 6, 0, 0, TimeSpan.Zero);

    // ── Happy path — hand-computed KPI fixture ─────────────────────────────────

    /// <summary>Seeds a small, fully hand-verified fixture and asserts every KPI card matches.
    /// Fixture shape:
    ///   3 completed orders with final_price_czk 200, 300, 100 → rides=3, revenue=600, aov=200
    ///   1 cancelled order                                      → cancellation_rate=0.25
    ///   2 distinct customer_user_ids                           → active_customers=2 (uses assigned returning customers)
    ///   1 new customer (only 1 order this period)             → new_customers=1 (only one of the user IDs has a single order)
    ///   2 distinct drivers over 3 completed orders            → active_drivers=2
    ///   2 driver shifts: 2h + 1h = 3h online                 → online_driver_hours≈3.0
    ///   revenue(600) / online_hours(3) = 200.0               → revenue_per_online_hour=200
    ///   ratings: 4+5 on 2 orders                             → avg_rating≈4.5
    ///   fulfillment_rate = 3 completed / 4 total = 0.75
    /// </summary>
    [Fact]
    public async Task HandleAsync_HandComputedFixture_ReturnsCorrectKpis()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, adminId) = await SeedFleetAsync(ct);
        var (driverA, driverB) = await SeedTwoDriversAsync(fleetId, ct);
        var (custA, custB) = await SeedTwoCustomersAsync(fleetId, ct);

        // Two driver shifts covering 3 online hours total.
        await SeedShiftAsync(fleetId, driverA, Sep10PragueAsUtc.AddHours(6), Sep10PragueAsUtc.AddHours(8), ct);  // 2h
        await SeedShiftAsync(fleetId, driverB, Sep10PragueAsUtc.AddHours(8), Sep10PragueAsUtc.AddHours(9), ct);  // 1h

        // 3 completed orders with ratings on 2 of them.
        await SeedOrderAsync(fleetId, OrderStatus.Completed, 200, driverA, custA, Sep10PragueAsUtc.AddHours(7), ratingStars: 4, ct: ct);
        await SeedOrderAsync(fleetId, OrderStatus.Completed, 300, driverA, custB, Sep10PragueAsUtc.AddHours(7), ratingStars: 5, ct: ct);
        await SeedOrderAsync(fleetId, OrderStatus.Completed, 100, driverB, custA, Sep10PragueAsUtc.AddHours(8), ct: ct);
        // 1 cancelled order (no driver).
        await SeedOrderAsync(fleetId, OrderStatus.Cancelled, 0, null, null, Sep10PragueAsUtc.AddHours(6), ct: ct);

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminId);
        var resp = await client.GetAsync(
            "/api/v1/analytics/overview?from=2026-09-10&to=2026-09-10&granularity=day", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<GetOverviewResponseDto>(ct);

        body.Should().NotBeNull();
        body!.Current.Rides.Should().Be(3, "3 completed orders");
        body.Current.RevenueCzk.Should().Be(600, "200+300+100");
        body.Current.Aov.Should().Be(200, "600/3");
        body.Current.CancellationRate.Should().BeApproximately(0.25, 0.01, "1 cancelled of 4 total");
        body.Current.FulfillmentRate.Should().BeApproximately(0.75, 0.01, "3 completed of 4 total");
        body.Current.ActiveCustomers.Should().Be(2, "custA and custB each appear in completed orders");
        body.Current.NewCustomers.Should().Be(1,
            "custB has exactly 1 completed order in the period (proxy for new); custA has 2");
        body.Current.ActiveDrivers.Should().Be(2, "driverA and driverB each completed at least one order");
        body.Current.OnlineDriverHours.Should().BeApproximately(3.0, 0.1, "2h + 1h shifts");
        body.Current.RevenuePerOnlineHour.Should().BeApproximately(200.0, 1.0, "600 / 3h");
        body.Current.AvgRating.Should().BeApproximately(4.5, 0.01, "(4+5)/2");
        body.Current.FulfillmentRate.Should().BeGreaterThan(0);
        body.Series.Should().NotBeEmpty("trend series must contain at least one bucket");
    }

    // ── Compare = true — prior period deltas ──────────────────────────────────

    /// <summary>With compare=true, the prior equal-length period should be recomputed.
    /// Current period: Sep 10 (1 day). Prior period: Sep 9 (1 day).
    /// Current: 2 completed orders for 500+300 = 800 CZK.
    /// Prior:   1 completed order  for 200 CZK.
    /// This verifies AnalyticsWindow.Resolve splits correctly: a Sep 9 order stays in Prior,
    /// not Current; delta rides = 2 − 1 = 1.</summary>
    [Fact]
    public async Task HandleAsync_CompareTrue_ReturnsPriorPeriodDeltas()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, adminId) = await SeedFleetAsync(ct);
        var (driverA, driverB) = await SeedTwoDriversAsync(fleetId, ct);
        var (custA, custB) = await SeedTwoCustomersAsync(fleetId, ct);

        // Sep10 UTC+2: Sep10 00:00 Prague = Sep09 22:00 UTC.
        // Sep 10 Prague day: 2026-09-09T22:00Z … 2026-09-10T22:00Z.
        // Sep 9 Prague day: 2026-09-08T22:00Z … 2026-09-09T22:00Z.

        // CURRENT (Sep 10 Prague = Sep10 06:00 UTC, within the Sep10 Prague window): 2 completed orders.
        await SeedOrderAsync(fleetId, OrderStatus.Completed, 500, driverA, custA, Sep10PragueAsUtc.AddHours(7), ct: ct);
        await SeedOrderAsync(fleetId, OrderStatus.Completed, 300, driverB, custB, Sep10PragueAsUtc.AddHours(8), ct: ct);

        // PRIOR (Sep 9 Prague day ≈ Sep08 22:00 UTC → Sep09 22:00 UTC): 1 completed order.
        // Sep10PragueAsUtc = 2026-09-10T06:00Z = 2026-09-10T08:00 Prague.
        // Sep09 08:00 Prague = 2026-09-09T06:00Z — within the Sep 9 Prague window.
        var sep9PragueAsUtc = new DateTimeOffset(2026, 9, 9, 6, 0, 0, TimeSpan.Zero);
        await SeedOrderAsync(fleetId, OrderStatus.Completed, 200, driverA, custA, sep9PragueAsUtc, ct: ct);

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminId);
        var resp = await client.GetAsync(
            "/api/v1/analytics/overview?from=2026-09-10&to=2026-09-10&compare=true", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<GetOverviewResponseDto>(ct);

        body.Should().NotBeNull();
        // Current: 2 completed rides; prior: 1 completed ride.
        body!.Current.Rides.Should().Be(2, "Sep 10 Prague window has 2 completed orders");
        body.Current.RevenueCzk.Should().Be(800, "500 + 300");

        body.Prior.Should().NotBeNull("compare=true must include a prior object");
        body.Prior!.Rides.Should().Be(1, "Sep 9 Prague window has 1 completed order");
        body.Prior.RevenueCzk.Should().Be(200, "prior order was 200 CZK");

        body.Deltas.Should().NotBeNull("compare=true must include a deltas object");
        body.Deltas!.Rides.Should().Be(1, "delta = current(2) - prior(1)");
        body.Deltas.RevenueCzk.Should().Be(600, "delta = current(800) - prior(200)");
    }

    // ── Tenant isolation ──────────────────────────────────────────────────────

    /// <summary>Fleet A's admin can only see their own orders; fleet B's orders are invisible.</summary>
    [Fact]
    public async Task HandleAsync_FleetAScopedFromFleetB_ReturnsOnlyOwnData()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetA, adminA) = await SeedFleetAsync(ct);
        var (fleetB, _) = await SeedFleetAsync(ct);
        var (driverA, _) = await SeedTwoDriversAsync(fleetA, ct);
        var (driverB, _) = await SeedTwoDriversAsync(fleetB, ct);
        var (custA, _) = await SeedTwoCustomersAsync(fleetA, ct);
        var (custB, _) = await SeedTwoCustomersAsync(fleetB, ct);

        // Fleet A: 1 completed order for 100.
        await SeedOrderAsync(fleetA, OrderStatus.Completed, 100, driverA, custA, Sep10PragueAsUtc.AddHours(7), ct: ct);
        // Fleet B: 1 completed order for 9999.
        await SeedOrderAsync(fleetB, OrderStatus.Completed, 9999, driverB, custB, Sep10PragueAsUtc.AddHours(7), ct: ct);

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetA, adminA);
        var resp = await client.GetAsync(
            "/api/v1/analytics/overview?from=2026-09-10&to=2026-09-10", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<GetOverviewResponseDto>(ct);

        body!.Current.Rides.Should().Be(1, "only fleet A's order counts");
        body.Current.RevenueCzk.Should().Be(100, "only fleet A's revenue");
    }

    // ── Validation — 400 paths ────────────────────────────────────────────────

    /// <summary>An invalid granularity string results in a 400 validation error.</summary>
    [Fact]
    public async Task HandleAsync_InvalidGranularity_Returns400()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, adminId) = await SeedFleetAsync(ct);

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminId);
        var resp = await client.GetAsync(
            "/api/v1/analytics/overview?from=2026-09-10&to=2026-09-10&granularity=invalid", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    /// <summary>An unparseable from date results in a 400 validation error.</summary>
    [Fact]
    public async Task HandleAsync_UnparseableDate_Returns400()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, adminId) = await SeedFleetAsync(ct);

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminId);
        var resp = await client.GetAsync(
            "/api/v1/analytics/overview?from=not-a-date&to=2026-09-10", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    /// <summary>from > to results in a 400 validation error.</summary>
    [Fact]
    public async Task HandleAsync_FromAfterTo_Returns400()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, adminId) = await SeedFleetAsync(ct);

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminId);
        var resp = await client.GetAsync(
            "/api/v1/analytics/overview?from=2026-09-15&to=2026-09-10", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    /// <summary>A non-FleetAdmin (Dispatcher) is forbidden.</summary>
    [Fact]
    public async Task HandleAsync_NonFleetAdmin_Returns403()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, _) = await SeedFleetAsync(ct);

        var client = fixture.Factory.CreateClient().AsDispatcher(fleetId);
        var resp = await client.GetAsync(
            "/api/v1/analytics/overview?from=2026-09-10&to=2026-09-10", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    // ── Perf — 50k seed under 500 ms (opt-in) ────────────────────────────────

    /// <summary>AC#3: With 50 000 seeded orders, the overview responds under 500 ms (warm), even
    /// with <c>compare=true</c> (doubled cost — computes both current and prior periods).
    /// <para>Opt-in via <c>RUN_PERF_TESTS=1</c> so the DoD gate stays fast on CI.</para></summary>
    [Fact]
    [Trait("Category", "Perf")]
    public async Task HandleAsync_50kSeed_RespondsUnder500ms()
    {
        if (Environment.GetEnvironmentVariable("RUN_PERF_TESTS") != "1")
        {
            Assert.Skip("Perf test is opt-in; set RUN_PERF_TESTS=1 to run.");
        }

        var ct = TestContext.Current.CancellationToken;
        var (fleetId, adminId) = await SeedFleetAsync(ct);

        await using (var scope = fixture.Factory.Services.CreateAsyncScope())
        {
            var seeder = scope.ServiceProvider.GetRequiredService<ReportSeedScript>();
            await seeder.SeedOrdersAsync(fleetId, 50_000, ct);
        }

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminId);
        // The seeder spreads orders over the past 180 days from real-wall-clock NOW() (Postgres).
        // Pick a 90-day current window that has ~half the data; prior is the preceding 90 days.
        // This ensures compare=true exercises the doubled-cost path with non-empty prior data.
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var periodTo = today;
        var periodFrom = today.AddDays(-90);
        var url = $"/api/v1/analytics/overview?from={periodFrom:yyyy-MM-dd}&to={periodTo:yyyy-MM-dd}&compare=true";

        // Warm-up hit absorbs EF query compilation.
        (await client.GetAsync(url, ct)).EnsureSuccessStatusCode();

        var sw = Stopwatch.StartNew();
        var resp = await client.GetAsync(url, ct);
        sw.Stop();

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        sw.ElapsedMilliseconds.Should().BeLessThan(500,
            $"analytics overview must stay under 500 ms at 50k orders with compare=true (measured: {sw.ElapsedMilliseconds} ms)");
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private async Task<(Guid fleetId, Guid adminId)> SeedFleetAsync(CancellationToken ct)
    {
        var fleetId = Guid.CreateVersion7();
        var adminId = Guid.CreateVersion7();
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.Fleets.Add(new Fleet
        {
            Id = fleetId,
            Slug = $"analytics-ov-{Guid.NewGuid():N}",
            Name = "Analytics Overview Fleet",
            Phone = $"+42076{Guid.NewGuid().ToString("N")[..7]}",
            Currency = "CZK",
            TimeZone = "Europe/Prague",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        });
        db.Users.Add(new User
        {
            Id = adminId,
            FleetId = fleetId,
            Role = UserRole.FleetAdmin,
            Email = $"admin-ov-{adminId:N}@analytics.local",
            Phone = $"+42077{Guid.NewGuid().ToString("N")[..7]}",
            DisplayName = "Analytics Admin",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync(ct);
        return (fleetId, adminId);
    }

    private async Task<(Guid driverIdA, Guid driverIdB)> SeedTwoDriversAsync(Guid fleetId, CancellationToken ct)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        Guid SeedDriver(string tag)
        {
            var userId = Guid.CreateVersion7();
            var driverId = Guid.CreateVersion7();
            db.Users.Add(new User
            {
                Id = userId,
                FleetId = fleetId,
                Role = UserRole.Driver,
                Email = $"drv-{driverId:N}@analytics.local",
                Phone = $"+42078{Guid.NewGuid().ToString("N")[..7]}",
                DisplayName = $"Driver {tag}",
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
            return driverId;
        }

        var a = SeedDriver("A");
        var b = SeedDriver("B");
        await db.SaveChangesAsync(ct);
        return (a, b);
    }

    private async Task<(Guid custA, Guid custB)> SeedTwoCustomersAsync(Guid fleetId, CancellationToken ct)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        Guid SeedCustomer()
        {
            var id = Guid.CreateVersion7();
            db.Users.Add(new User
            {
                Id = id,
                FleetId = null,    // customers have nullable fleet
                Role = UserRole.Customer,
                Email = $"cust-{id:N}@analytics.local",
                Phone = $"+42079{Guid.NewGuid().ToString("N")[..7]}",
                DisplayName = "Customer",
                IsActive = true,
                CreatedAt = DateTimeOffset.UtcNow
            });
            return id;
        }

        var a = SeedCustomer();
        var b = SeedCustomer();
        await db.SaveChangesAsync(ct);
        return (a, b);
    }

    private async Task SeedShiftAsync(
        Guid fleetId, Guid driverId, DateTimeOffset startedAt, DateTimeOffset endedAt, CancellationToken ct)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        // Must resolve vehicle FK for driver_shifts.driver_id → drivers.id → vehicle.
        // Seed a minimal vehicle.
        var vehicleId = Guid.CreateVersion7();
        db.Vehicles.Add(new Vehicle
        {
            Id = vehicleId,
            FleetId = fleetId,
            Plate = $"OVR{Guid.NewGuid().ToString("N")[..4]}",
            Make = "Skoda",
            Model = "Octavia",
            Color = "White",
            Seats = 4,
            IsActive = true
        });
        db.DriverShifts.Add(new DriverShift
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleetId,
            DriverId = driverId,
            VehicleId = vehicleId,
            StartedAt = startedAt,
            EndedAt = endedAt
        });
        await db.SaveChangesAsync(ct);
    }

    private async Task SeedOrderAsync(
        Guid fleetId,
        OrderStatus status,
        int finalPriceCzk,
        Guid? driverId,
        Guid? customerUserId,
        DateTimeOffset createdAt,
        int? ratingStars = null,
        CancellationToken ct = default)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.Orders.Add(new Order
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleetId,
            PublicCode = Guid.NewGuid().ToString("N")[..6].ToUpperInvariant(),
            Status = status,
            Source = OrderSource.App,
            CustomerPhone = "+420777100900",
            CustomerUserId = customerUserId,
            PickupAddress = "Pickup",
            PickupLat = 50.08,
            PickupLng = 14.43,
            Passengers = 1,
            PriceType = PriceType.Estimate,
            DriverId = driverId,
            FinalPriceCzk = finalPriceCzk > 0 ? finalPriceCzk : null,
            PaymentType = PaymentType.Cash,
            RatingStars = ratingStars,
            RatedAt = ratingStars.HasValue ? createdAt.AddHours(1) : null,
            CreatedAt = createdAt,
            CompletedAt = status == OrderStatus.Completed ? createdAt.AddMinutes(25) : null,
            CancelledAt = status == OrderStatus.Cancelled ? createdAt.AddMinutes(5) : null,
            UpdatedAt = createdAt,
            Version = 1
        });
        await db.SaveChangesAsync(ct);
    }

    // ── Local response DTOs (mirrors actual response shape) ───────────────────

    private sealed record GetOverviewResponseDto(
        OverviewKpiDto Current,
        OverviewKpiDto? Prior,
        OverviewDeltaDto? Deltas,
        List<TrendBucketDto> Series);

    private sealed record OverviewKpiDto(
        int Rides,
        int RevenueCzk,
        int Aov,
        double FulfillmentRate,
        double CancellationRate,
        int ActiveCustomers,
        int NewCustomers,
        int ActiveDrivers,
        double OnlineDriverHours,
        double RevenuePerOnlineHour,
        double? AvgRating);

    private sealed record OverviewDeltaDto(
        int Rides,
        int RevenueCzk,
        int Aov,
        double FulfillmentRate,
        double CancellationRate,
        int ActiveCustomers,
        int NewCustomers,
        int ActiveDrivers,
        double OnlineDriverHours,
        double RevenuePerOnlineHour,
        double? AvgRating);

    private sealed record TrendBucketDto(string Bucket, int Rides, int RevenueCzk);
}

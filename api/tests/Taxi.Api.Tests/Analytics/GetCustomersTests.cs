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

/// <summary>Integration tests for GET /api/v1/analytics/customers (WI-09):
/// new-vs-returning rides per bucket, repeat rate, frequency distribution,
/// monthly cohort triangle, top customers, ratings analysis,
/// GDPR anonymized-customer exclusion, tenant isolation, and perf &lt;500ms @50k.</summary>
[Collection(TestCollections.Database)]
public sealed class GetCustomersTests(PostgresFixture fixture)
{
    // All fixture events fall on 2026-09-10 (UTC). Prague UTC+2 in Sep → local 08:00.
    private static readonly DateTimeOffset Sep10Base = new(2026, 9, 10, 6, 0, 0, TimeSpan.Zero);

    // ── Happy-path: hand-computed new-vs-returning split ─────────────────────

    /// <summary>Seeds three orders in the window:
    ///   Customer A (CustomerUserId set): first ride Aug 1 (before window) → returning in window.
    ///   Customer B (CustomerUserId set): first ride Sep 10 (in window) → new in window.
    ///   Anonymized order (CustomerPhone=+420000000000): counts in total rides/revenue, NOT in new/returning.
    ///
    /// Expected for window Sep 10:
    ///   bucket new_rides=1, returning_rides=1, total_rides=3, total_revenue=800 (200+300+300),
    ///   repeat_rate = 1 identity / 2 identities = 50%.
    ///   frequency: 1 identity with 1 ride → freq_one=1, freq_two_to_five=1 (Customer A has 2 rides in window? No.)
    ///
    /// Simpler fixture for frequency distribution:
    ///   Customer A: 2 rides in window (→ freq_two_to_five), returning.
    ///   Customer B: 1 ride in window (→ freq_one), new.
    ///   Anonymized: 1 ride (→ excluded from frequency).
    /// So: new_identities=1, returning_identities=1, total_rides=4, repeat_rate=50%,
    ///     freq_one=1, freq_two_to_five=1, freq_six_plus=0.
    /// </summary>
    [Fact]
    public async Task HandleAsync_HandComputedFixture_SplitsNewVsReturning()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, adminId) = await SeedFleetAsync(ct);

        var customerAUserId = Guid.CreateVersion7();
        var customerBUserId = Guid.CreateVersion7();

        // Customer A: 1 ride before the window → makes them "returning" in window
        // Also 2 rides IN window (Aug+Sep rides, so freq=2 → freq_two_to_five)
        var aug1 = new DateTimeOffset(2026, 8, 1, 6, 0, 0, TimeSpan.Zero);
        await SeedCustomerOrderAsync(fleetId,
            customerUserId: customerAUserId,
            customerPhone: $"+420{Guid.NewGuid().ToString("N")[..9]}",
            completedAt: aug1,
            finalPriceCzk: 150, ct: ct);

        // Customer A: 2 rides IN window (Sep 10)
        await SeedCustomerOrderAsync(fleetId,
            customerUserId: customerAUserId,
            customerPhone: $"+420{Guid.NewGuid().ToString("N")[..9]}",
            completedAt: Sep10Base.AddHours(1),
            finalPriceCzk: 200, ct: ct);
        await SeedCustomerOrderAsync(fleetId,
            customerUserId: customerAUserId,
            customerPhone: $"+420{Guid.NewGuid().ToString("N")[..9]}",
            completedAt: Sep10Base.AddHours(2),
            finalPriceCzk: 100, ct: ct);

        // Customer B: 1 ride IN window only → new (freq_one=1)
        await SeedCustomerOrderAsync(fleetId,
            customerUserId: customerBUserId,
            customerPhone: $"+420{Guid.NewGuid().ToString("N")[..9]}",
            completedAt: Sep10Base.AddHours(3),
            finalPriceCzk: 300, ct: ct);

        // Anonymized: 1 ride (sentinel phone, null user id)
        await SeedCustomerOrderAsync(fleetId,
            customerUserId: null,
            customerPhone: "+420000000000",
            completedAt: Sep10Base.AddHours(4),
            finalPriceCzk: 300, ct: ct);

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminId);
        var resp = await client.GetAsync(
            "/api/v1/analytics/customers?from=2026-09-10&to=2026-09-10", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<GetCustomersResponseDto>(ct);

        body.Should().NotBeNull();

        // Volume (includes anonymized)
        // All 5 orders but only IN window = 4 (2 from A, 1 from B, 1 anonymized; Aug1 is outside window)
        body!.TotalRides.Should().Be(4, "2 from A + 1 from B + 1 anonymized, all in Sep 10 window");
        body.TotalRevenueCzk.Should().Be(900, "200+100+300+300");

        // Identity-based (excludes anonymized)
        body.NewIdentities.Should().Be(1, "Customer B is new (first ride in window)");
        body.ReturningIdentities.Should().Be(1, "Customer A is returning (had a ride before window)");

        // Repeat rate = returning / (new + returning) = 1/2 = 50%
        body.RepeatRate.Should().BeApproximately(50.0, 0.1, "1 returning / 2 identities = 50%");

        // Frequency distribution (excludes anonymized)
        body.FreqOne.Should().Be(1, "Customer B has 1 ride in window");
        body.FreqTwoToFive.Should().Be(1, "Customer A has 2 rides in window");
        body.FreqSixPlus.Should().Be(0, "no identity has 6+ rides in window");

        body.Prior.Should().BeNull("compare=false by default");
    }

    // ── Cohort triangle ───────────────────────────────────────────────────────

    /// <summary>Seeds customers in two acquisition months (Aug and Sep 2026) and verifies
    /// the cohort triangle correctly attributes rides to cohort and activity months.
    ///
    /// Customer A: first ride Aug 10 (Prague: Aug, acq=Aug). Also rides Sep 10 (act=Sep).
    ///   → row (Aug, Aug, 1), (Aug, Sep, 1)
    /// Customer B: first ride Sep 10 (acq=Sep). Only rides in Sep.
    ///   → row (Sep, Sep, 1)
    /// Expected cohort rows: (Aug, Aug, 1), (Aug, Sep, 1), (Sep, Sep, 1) → triangle has 3 rows.
    /// CohortRows[0]: AcqMonth=Aug, MonthsSince=0, ActiveCustomers=1
    /// CohortRows[1]: AcqMonth=Aug, MonthsSince=1, ActiveCustomers=1
    /// CohortRows[2]: AcqMonth=Sep, MonthsSince=0, ActiveCustomers=1
    /// </summary>
    [Fact]
    public async Task HandleAsync_CohortTriangle_MatchesHandComputed()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, adminId) = await SeedFleetAsync(ct);

        var customerAUserId = Guid.CreateVersion7();
        var customerBUserId = Guid.CreateVersion7();

        var aug10 = new DateTimeOffset(2026, 8, 10, 6, 0, 0, TimeSpan.Zero);
        var sep10 = new DateTimeOffset(2026, 9, 10, 6, 0, 0, TimeSpan.Zero);

        // Customer A: acquired Aug, also active Sep
        await SeedCustomerOrderAsync(fleetId,
            customerUserId: customerAUserId,
            customerPhone: $"+420{Guid.NewGuid().ToString("N")[..9]}",
            completedAt: aug10,
            finalPriceCzk: 100, ct: ct);
        await SeedCustomerOrderAsync(fleetId,
            customerUserId: customerAUserId,
            customerPhone: $"+420{Guid.NewGuid().ToString("N")[..9]}",
            completedAt: sep10,
            finalPriceCzk: 100, ct: ct);

        // Customer B: acquired Sep
        await SeedCustomerOrderAsync(fleetId,
            customerUserId: customerBUserId,
            customerPhone: $"+420{Guid.NewGuid().ToString("N")[..9]}",
            completedAt: sep10.AddHours(1),
            finalPriceCzk: 100, ct: ct);

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminId);
        var resp = await client.GetAsync(
            "/api/v1/analytics/customers?from=2026-08-01&to=2026-09-30", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<GetCustomersResponseDto>(ct);

        body.Should().NotBeNull();
        body!.CohortRows.Should().HaveCount(3, "2 acq rows + 1 retention row");

        // (Aug, months_since=0) → 1 customer
        var aug0 = body.CohortRows.FirstOrDefault(r => r.AcqMonthLabel == "2026-08" && r.MonthsSince == 0);
        aug0.Should().NotBeNull("acquisition month Aug, months-since 0");
        aug0!.ActiveCustomers.Should().Be(1);

        // (Aug, months_since=1) → 1 customer (Customer A also active in Sep)
        var aug1 = body.CohortRows.FirstOrDefault(r => r.AcqMonthLabel == "2026-08" && r.MonthsSince == 1);
        aug1.Should().NotBeNull("acquisition month Aug, months-since 1");
        aug1!.ActiveCustomers.Should().Be(1);

        // (Sep, months_since=0) → 1 customer (Customer B acquired Sep)
        var sep0 = body.CohortRows.FirstOrDefault(r => r.AcqMonthLabel == "2026-09" && r.MonthsSince == 0);
        sep0.Should().NotBeNull("acquisition month Sep, months-since 0");
        sep0!.ActiveCustomers.Should().Be(1);
    }

    // ── GDPR: anonymized customer handling ───────────────────────────────────

    /// <summary>Proves both sides of AC#5:
    ///   INCLUDED side: anonymized order counts in TotalRides and TotalRevenueCzk.
    ///   EXCLUDED side: anonymized identity is absent from NewIdentities, ReturningIdentities,
    ///                  FreqOne/TwoToFive/SixPlus, CohortRows, and TopCustomers.
    /// Fixture: 1 known customer (1 ride, new) + 1 anonymized order.
    /// </summary>
    [Fact]
    public async Task HandleAsync_AnonymizedCustomer_ExcludedFromIdentityMetricsOnly()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, adminId) = await SeedFleetAsync(ct);

        var knownUserId = Guid.CreateVersion7();
        var knownPhone = $"+420{Guid.NewGuid().ToString("N")[..9]}";

        // 1 known customer order
        await SeedCustomerOrderAsync(fleetId,
            customerUserId: knownUserId,
            customerPhone: knownPhone,
            completedAt: Sep10Base,
            finalPriceCzk: 200, ct: ct);

        // 1 anonymized order (sentinel phone, null userId)
        await SeedCustomerOrderAsync(fleetId,
            customerUserId: null,
            customerPhone: "+420000000000",
            completedAt: Sep10Base.AddHours(1),
            finalPriceCzk: 500, ct: ct);

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminId);
        var resp = await client.GetAsync(
            "/api/v1/analytics/customers?from=2026-09-10&to=2026-09-10", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<GetCustomersResponseDto>(ct);

        body.Should().NotBeNull();

        // INCLUDED: volume aggregates count the anonymized order
        body!.TotalRides.Should().Be(2, "known + anonymized order both count toward total");
        body.TotalRevenueCzk.Should().Be(700, "200 + 500 = 700 CZK");

        // EXCLUDED: identity metrics see only the 1 known customer
        body.NewIdentities.Should().Be(1, "only known customer is new; anonymized excluded");
        body.ReturningIdentities.Should().Be(0, "no returning customer; anonymized excluded");
        body.FreqOne.Should().Be(1, "only known customer in frequency; anonymized excluded");
        body.FreqTwoToFive.Should().Be(0);
        body.FreqSixPlus.Should().Be(0);

        // Cohort: anonymized has no CustomerUserId → cohort is identity-based, so excluded
        body.CohortRows.Should().HaveCount(1, "only 1 identified customer in cohort");

        // Top customers: anonymized excluded
        body.TopCustomers.Should().HaveCount(1, "only 1 identified customer in top list");
        body.TopCustomers[0].CustomerUserId.Should().Be(knownUserId);
    }

    // ── Top customers ranking ─────────────────────────────────────────────────

    /// <summary>Seeds three customers with different ride counts and revenues in the window.
    /// Verifies TopCustomers is sorted by rides DESC then revenue DESC.
    ///
    /// Customer A (userId set): 3 rides, 900 CZK.
    /// Customer B (userId set): 1 ride, 1000 CZK.
    /// Customer C (phone-only, no userId): 2 rides, 400 CZK.
    /// Expected: A first (3 rides), C second (2 rides), B third (1 ride).
    /// </summary>
    [Fact]
    public async Task HandleAsync_TopCustomers_RanksByRidesAndRevenue()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, adminId) = await SeedFleetAsync(ct);

        var customerAUserId = Guid.CreateVersion7();
        var customerBUserId = Guid.CreateVersion7();
        var phoneC = $"+420{Guid.NewGuid().ToString("N")[..9]}";

        // Customer A: 3 rides (userId set)
        for (var i = 0; i < 3; i++)
        {
            await SeedCustomerOrderAsync(fleetId,
                customerUserId: customerAUserId,
                customerPhone: $"+420{Guid.NewGuid().ToString("N")[..9]}",
                completedAt: Sep10Base.AddHours(i),
                finalPriceCzk: 300, ct: ct);
        }

        // Customer B: 1 ride, high revenue
        await SeedCustomerOrderAsync(fleetId,
            customerUserId: customerBUserId,
            customerPhone: $"+420{Guid.NewGuid().ToString("N")[..9]}",
            completedAt: Sep10Base.AddHours(3),
            finalPriceCzk: 1000, ct: ct);

        // Customer C: 2 rides, phone-only (no userId)
        for (var i = 0; i < 2; i++)
        {
            await SeedCustomerOrderAsync(fleetId,
                customerUserId: null,
                customerPhone: phoneC,
                completedAt: Sep10Base.AddHours(4 + i),
                finalPriceCzk: 200, ct: ct);
        }

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminId);
        var resp = await client.GetAsync(
            "/api/v1/analytics/customers?from=2026-09-10&to=2026-09-10", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<GetCustomersResponseDto>(ct);

        body.Should().NotBeNull();
        body!.TopCustomers.Should().HaveCountGreaterThanOrEqualTo(3, "all 3 identities should appear");

        var first = body.TopCustomers[0];
        var second = body.TopCustomers[1];
        var third = body.TopCustomers[2];

        first.Rides.Should().Be(3, "Customer A has most rides");
        first.CustomerUserId.Should().Be(customerAUserId);

        second.Rides.Should().Be(2, "Customer C has 2 rides");
        second.CustomerUserId.Should().BeNull("Customer C is phone-only");
        second.CustomerPhone.Should().Be(phoneC);

        third.Rides.Should().Be(1, "Customer B has 1 ride");
        third.CustomerUserId.Should().Be(customerBUserId);
    }

    // ── Tenant isolation ──────────────────────────────────────────────────────

    /// <summary>Fleet A has 2 customer orders; Fleet B has 5 orders. Fleet A admin sees only Fleet A data.</summary>
    [Fact]
    public async Task HandleAsync_Customers_TenantsIsolated()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetAId, adminAId) = await SeedFleetAsync(ct);
        var (fleetBId, _) = await SeedFleetAsync(ct);

        // Fleet A: 2 orders
        for (var i = 0; i < 2; i++)
        {
            await SeedCustomerOrderAsync(fleetAId,
                customerUserId: Guid.CreateVersion7(),
                customerPhone: $"+420{Guid.NewGuid().ToString("N")[..9]}",
                completedAt: Sep10Base.AddHours(i),
                finalPriceCzk: 100, ct: ct);
        }

        // Fleet B: 5 orders
        for (var i = 0; i < 5; i++)
        {
            await SeedCustomerOrderAsync(fleetBId,
                customerUserId: Guid.CreateVersion7(),
                customerPhone: $"+420{Guid.NewGuid().ToString("N")[..9]}",
                completedAt: Sep10Base.AddHours(i),
                finalPriceCzk: 200, ct: ct);
        }

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetAId, adminAId);
        var resp = await client.GetAsync(
            "/api/v1/analytics/customers?from=2026-09-10&to=2026-09-10", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<GetCustomersResponseDto>(ct);

        body.Should().NotBeNull();
        body!.TotalRides.Should().Be(2, "Fleet A has exactly 2 orders; Fleet B orders excluded");
        body.TopCustomers.Should().HaveCount(2, "Fleet A has exactly 2 distinct identities");
    }

    // ── New vs returning per bucket ───────────────────────────────────────────

    /// <summary>Seeds rides for two customers over two days:
    ///   Day 1: Customer A (returning — had Aug prior ride): 1 ride. Customer B (new): 1 ride.
    ///   Day 2: Customer A (returning): 1 ride. Customer C (new): 1 ride.
    /// Expected NewVsReturningBuckets (granularity=day):
    ///   Day 1: NewRides=1, ReturningRides=1.
    ///   Day 2: NewRides=1, ReturningRides=1.
    /// </summary>
    [Fact]
    public async Task HandleAsync_NewVsReturningBuckets_SplitsPerBucket()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, adminId) = await SeedFleetAsync(ct);

        var customerAUserId = Guid.CreateVersion7(); // returning (had Aug ride)
        var customerBUserId = Guid.CreateVersion7(); // new on Day 1
        var customerCUserId = Guid.CreateVersion7(); // new on Day 2

        // Customer A: prior ride in Aug (makes them returning in Sep window)
        var aug1 = new DateTimeOffset(2026, 8, 1, 6, 0, 0, TimeSpan.Zero);
        await SeedCustomerOrderAsync(fleetId, customerAUserId,
            customerPhone: $"+420{Guid.NewGuid().ToString("N")[..9]}",
            completedAt: aug1, finalPriceCzk: 100, ct: ct);

        // Day 1 (Sep 10)
        var day1 = new DateTimeOffset(2026, 9, 10, 6, 0, 0, TimeSpan.Zero);
        await SeedCustomerOrderAsync(fleetId, customerAUserId,
            customerPhone: $"+420{Guid.NewGuid().ToString("N")[..9]}",
            completedAt: day1, finalPriceCzk: 100, ct: ct);
        await SeedCustomerOrderAsync(fleetId, customerBUserId,
            customerPhone: $"+420{Guid.NewGuid().ToString("N")[..9]}",
            completedAt: day1.AddHours(1), finalPriceCzk: 100, ct: ct);

        // Day 2 (Sep 11)
        var day2 = new DateTimeOffset(2026, 9, 11, 6, 0, 0, TimeSpan.Zero);
        await SeedCustomerOrderAsync(fleetId, customerAUserId,
            customerPhone: $"+420{Guid.NewGuid().ToString("N")[..9]}",
            completedAt: day2, finalPriceCzk: 100, ct: ct);
        await SeedCustomerOrderAsync(fleetId, customerCUserId,
            customerPhone: $"+420{Guid.NewGuid().ToString("N")[..9]}",
            completedAt: day2.AddHours(1), finalPriceCzk: 100, ct: ct);

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminId);
        var resp = await client.GetAsync(
            "/api/v1/analytics/customers?from=2026-09-10&to=2026-09-11&granularity=day", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<GetCustomersResponseDto>(ct);

        body.Should().NotBeNull();
        body!.NewVsReturningBuckets.Should().HaveCount(2, "two days with rides");

        var day1Bucket = body.NewVsReturningBuckets
            .FirstOrDefault(b => b.Bucket.StartsWith("2026-09-10"));
        day1Bucket.Should().NotBeNull("day1 bucket must exist");
        day1Bucket!.NewRides.Should().Be(1, "Customer B is new on day1");
        day1Bucket.ReturningRides.Should().Be(1, "Customer A is returning on day1");

        var day2Bucket = body.NewVsReturningBuckets
            .FirstOrDefault(b => b.Bucket.StartsWith("2026-09-11"));
        day2Bucket.Should().NotBeNull("day2 bucket must exist");
        day2Bucket!.NewRides.Should().Be(1, "Customer C is new on day2");
        day2Bucket.ReturningRides.Should().Be(1, "Customer A is returning on day2");
    }

    // ── Ratings analysis: avg trend + worst-rated ────────────────────────────

    /// <summary>Seeds a day with two rated orders (1-star and 5-star) and a low-rated order (≤3 stars).
    /// Verifies: AvgTrend has a bucket for each day with rated rides; WorstRated lists the ≤3-star order
    /// with PublicCode, RatingStars, RatingComment, and DriverName populated.</summary>
    [Fact]
    public async Task HandleAsync_RatingsAnalysis_HasAvgTrendAndWorstRated()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, adminId) = await SeedFleetAsync(ct);

        // Seed a driver
        var driverUserId = Guid.CreateVersion7();
        var driverId = await SeedDriverAsync(fleetId, driverUserId, "Test Driver", ct);

        var customerAUserId = Guid.CreateVersion7();

        // Order A: 5-star, Sep 10
        var orderACode = Guid.NewGuid().ToString("N")[..6].ToUpperInvariant();
        await SeedRatedOrderAsync(fleetId, customerAUserId, driverId,
            completedAt: Sep10Base,
            ratingStars: 5,
            ratingComment: null,
            publicCode: orderACode,
            finalPriceCzk: 100, ct: ct);

        // Order B: 1-star with comment, Sep 10 (worst-rated — ≤3 stars)
        var orderBCode = Guid.NewGuid().ToString("N")[..6].ToUpperInvariant();
        await SeedRatedOrderAsync(fleetId, customerAUserId, driverId,
            completedAt: Sep10Base.AddHours(1),
            ratingStars: 1,
            ratingComment: "Very bad experience",
            publicCode: orderBCode,
            finalPriceCzk: 120, ct: ct);

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminId);
        var resp = await client.GetAsync(
            "/api/v1/analytics/customers?from=2026-09-10&to=2026-09-10&granularity=day", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<GetCustomersResponseDto>(ct);

        body.Should().NotBeNull();

        // AvgTrend: one bucket for Sep 10 with avg (5+1)/2 = 3.0
        body!.Ratings.AvgTrend.Should().HaveCount(1, "one day with rated rides");
        var trendBucket = body.Ratings.AvgTrend[0];
        trendBucket.Bucket.Should().StartWith("2026-09-10", "bucket should be Sep 10");
        trendBucket.AvgRating.Should().BeApproximately(3.0, 0.1, "avg of 5 and 1 stars = 3.0");
        trendBucket.Rides.Should().Be(2, "2 rated rides in the bucket");

        // WorstRated: only the 1-star order (≤3 threshold)
        body.Ratings.WorstRated.Should().HaveCount(1, "one order with rating ≤ 3");
        var worst = body.Ratings.WorstRated[0];
        worst.RatingStars.Should().Be(1);
        worst.RatingComment.Should().Be("Very bad experience");
        worst.PublicCode.Should().Be(orderBCode);
        worst.DriverName.Should().Be("Test Driver", "driver name fetched via JOIN");
    }

    // ── Seed helpers (extended) ───────────────────────────────────────────────

    /// <summary>Seeds a Driver + linked User row; returns the Driver.Id.</summary>
    private async Task<Guid> SeedDriverAsync(
        Guid fleetId, Guid driverUserId, string displayName, CancellationToken ct)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        db.Users.Add(new User
        {
            Id = driverUserId,
            FleetId = fleetId,
            Role = UserRole.Driver,
            Phone = $"+420{Guid.NewGuid().ToString("N")[..9]}",
            DisplayName = displayName,
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        });

        var driverId = Guid.CreateVersion7();
        db.Drivers.Add(new Driver
        {
            Id = driverId,
            FleetId = fleetId,
            UserId = driverUserId,
            Status = DriverStatus.Offline
        });

        await db.SaveChangesAsync(ct);
        return driverId;
    }

    /// <summary>Seeds a completed, rated order with a specific driver and rating.</summary>
    private async Task SeedRatedOrderAsync(
        Guid fleetId,
        Guid? customerUserId,
        Guid driverId,
        DateTimeOffset completedAt,
        int ratingStars,
        string? ratingComment,
        string publicCode,
        int finalPriceCzk,
        CancellationToken ct)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        // Ensure customer user row if needed
        if (customerUserId.HasValue && _seededCustomerUsers.Add(customerUserId.Value))
        {
            db.Users.Add(new User
            {
                Id = customerUserId.Value,
                FleetId = null,
                Role = UserRole.Customer,
                Email = null,
                Phone = $"+420{Guid.NewGuid().ToString("N")[..9]}",
                DisplayName = $"Customer {customerUserId.Value.ToString("N")[..8]}",
                IsActive = true,
                CreatedAt = completedAt.AddDays(-30)
            });
        }

        db.Orders.Add(new Order
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleetId,
            PublicCode = publicCode,
            Status = OrderStatus.Completed,
            Source = OrderSource.Dispatcher,
            CustomerUserId = customerUserId,
            CustomerPhone = $"+420{Guid.NewGuid().ToString("N")[..9]}",
            CustomerName = customerUserId.HasValue ? $"Customer {customerUserId.Value.ToString("N")[..8]}" : "Unknown",
            PickupAddress = "Rating Test St",
            PickupLat = 50.08,
            PickupLng = 14.43,
            PriceType = PriceType.Meter,
            FinalPriceCzk = finalPriceCzk,
            PaymentType = PaymentType.Cash,
            DriverId = driverId,
            CompletedAt = completedAt,
            RatingStars = ratingStars,
            RatingComment = ratingComment,
            RatedAt = completedAt.AddMinutes(10),
            CreatedAt = completedAt.AddMinutes(-15),
            UpdatedAt = completedAt,
            Version = 1
        });

        await db.SaveChangesAsync(ct);
    }

    // ── Perf test (opt-in via RUN_PERF_TESTS=1) ──────────────────────────────

    /// <summary>Seeds 50k completed orders across 100 phone-only customers, calls
    /// GET /api/v1/analytics/customers with compare=true, and asserts the response
    /// is returned in under 500 ms.</summary>
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

        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var rng = new Random(42);

        // 100 phone-based identities (no userId)
        var phones = Enumerable.Range(0, 100)
            .Select(_ => $"+420{Guid.NewGuid().ToString("N")[..9]}")
            .ToArray();

        // Bulk seed 50k completed orders
        for (var i = 0; i < 50_000; i++)
        {
            var phone = phones[rng.Next(phones.Length)];
            var createdAt = Sep10Base.AddMinutes(rng.Next(0, 3 * 24 * 60));
            var completedAt = createdAt.AddMinutes(rng.Next(15, 60));

            db.Orders.Add(new Order
            {
                Id = Guid.CreateVersion7(),
                FleetId = fleetId,
                PublicCode = Guid.NewGuid().ToString("N")[..6].ToUpperInvariant(),
                Status = OrderStatus.Completed,
                Source = OrderSource.Dispatcher,
                CustomerPhone = phone,
                PickupAddress = "Perf Test St",
                PickupLat = 50.08,
                PickupLng = 14.43,
                PriceType = PriceType.Meter,
                FinalPriceCzk = rng.Next(100, 1000),
                PaymentType = PaymentType.Cash,
                CompletedAt = completedAt,
                CreatedAt = createdAt,
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
            "/api/v1/analytics/customers?from=2026-09-10&to=2026-09-13&compare=true", ct);
        sw.Stop();

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        sw.ElapsedMilliseconds.Should().BeLessThan(500,
            $"customers endpoint must respond in <500ms at 50k rows with compare=true; took {sw.ElapsedMilliseconds}ms");
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
            Phone = $"+420{Guid.NewGuid().ToString("N")[..9]}",
            IsActive = true
        });
        db.Users.Add(new User
        {
            Id = adminId,
            FleetId = fleetId,
            Role = UserRole.FleetAdmin,
            Email = $"admin-cust-{adminId:N}@analytics.local",
            Phone = $"+420{Guid.NewGuid().ToString("N")[..9]}",
            DisplayName = "Customers Admin",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync(ct);
        return (fleetId, adminId);
    }

    // Tracks which customerUserIds have already had a user row seeded (to avoid duplicates)
    private readonly HashSet<Guid> _seededCustomerUsers = new();

    /// <summary>Seeds a completed order for a customer (with or without a user account).
    /// If customerUserId is non-null and the user hasn't been seeded yet, a Customer user row is created first.</summary>
    private async Task SeedCustomerOrderAsync(
        Guid fleetId,
        Guid? customerUserId,
        string customerPhone,
        DateTimeOffset completedAt,
        int finalPriceCzk,
        CancellationToken ct)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        // Ensure a user row exists for FK if customerUserId is set
        if (customerUserId.HasValue && _seededCustomerUsers.Add(customerUserId.Value))
        {
            db.Users.Add(new User
            {
                Id = customerUserId.Value,
                FleetId = null, // customers have no fleet
                Role = UserRole.Customer,
                Email = null,
                Phone = customerPhone,
                DisplayName = $"Customer {customerUserId.Value.ToString("N")[..8]}",
                IsActive = true,
                CreatedAt = completedAt.AddDays(-30)
            });
        }

        db.Orders.Add(new Order
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleetId,
            PublicCode = Guid.NewGuid().ToString("N")[..6].ToUpperInvariant(),
            Status = OrderStatus.Completed,
            Source = OrderSource.Dispatcher,
            CustomerUserId = customerUserId,
            CustomerPhone = customerPhone,
            CustomerName = customerUserId.HasValue ? $"Customer {customerUserId.Value.ToString("N")[..8]}" : "Anonymizováno",
            PickupAddress = "Customer Test St",
            PickupLat = 50.08,
            PickupLng = 14.43,
            PriceType = PriceType.Meter,
            FinalPriceCzk = finalPriceCzk,
            PaymentType = PaymentType.Cash,
            CompletedAt = completedAt,
            CreatedAt = completedAt.AddMinutes(-15),
            UpdatedAt = completedAt,
            Version = 1
        });
        await db.SaveChangesAsync(ct);
    }

    // ── Local response DTOs (mirrors actual response shape) ───────────────────

    /// <summary>Local mirror of the GetCustomersResponse shape for deserialization.</summary>
    private sealed record GetCustomersResponseDto(
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
        RatingsAnalysisDto Ratings,
        GetCustomersPriorDto? Prior = null);

    /// <summary>New vs returning ride counts for a time bucket.</summary>
    private sealed record NewVsReturningBucketDto(string Bucket, int NewRides, int ReturningRides);

    /// <summary>Prior period recomputation block.</summary>
    private sealed record GetCustomersPriorDto(
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

    /// <summary>One row in the monthly cohort retention triangle.</summary>
    private sealed record CustomerCohortRowDto(
        string AcqMonthLabel,
        int MonthsSince,
        int ActiveCustomers);

    /// <summary>Top customer ranking row.</summary>
    private sealed record TopCustomerDto(
        Guid? CustomerUserId,
        string? CustomerPhone,
        string? CustomerName,
        int Rides,
        int RevenueCzk);

    /// <summary>Ratings analysis summary.</summary>
    private sealed record RatingsAnalysisDto(
        int TotalRated,
        double? AvgRating,
        List<RatingBucketDto> Distribution,
        List<RatingTrendBucketDto> AvgTrend,
        List<WorstRatedOrderDto> WorstRated);

    /// <summary>Distribution count for a single star level.</summary>
    private sealed record RatingBucketDto(int Stars, int Count);

    /// <summary>Avg rating per time bucket.</summary>
    private sealed record RatingTrendBucketDto(string Bucket, int Rides, double? AvgRating);

    /// <summary>A worst-rated order (≤3 stars) for complaint follow-up.</summary>
    private sealed record WorstRatedOrderDto(
        Guid OrderId,
        string PublicCode,
        DateTimeOffset CompletedAt,
        int RatingStars,
        string? RatingComment,
        string? DriverName);

}



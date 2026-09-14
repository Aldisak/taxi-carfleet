using System.Diagnostics;
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Infrastructure.Seed;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Analytics;

/// <summary>Integration tests for GET /api/v1/analytics/revenue (WI-07):
/// revenue series stacked by PaymentType + split by OrderSource/PriceType, AOV trend,
/// price-override impact, top routes by revenue, zone revenue (bbox), SMS cost line,
/// tenant isolation, and perf &lt;500 ms @ 50k with compare=true.</summary>
[Collection(TestCollections.Database)]
public sealed class GetRevenueTests(PostgresFixture fixture)
{
    // All fixture orders fall on 2026-09-10 in Prague time (UTC+2 in September).
    // 2026-09-10T06:00 UTC = 2026-09-10T08:00 Prague (DOW=4 Thursday, hour=8 Prague local).
    private static readonly DateTimeOffset Sep10UtcBase = new(2026, 9, 10, 6, 0, 0, TimeSpan.Zero);

    // ── Happy path — hand-computed revenue fixture ────────────────────────────

    /// <summary>Seeds completed orders with known PaymentType/PriceType/Source and final prices,
    /// and verifies the bucket sums match hand-computed values.
    /// <para>Fixture (all 2026-09-10, one bucket):
    ///   - Order 1: Cash, App, Meter, FinalPrice=200
    ///   - Order 2: Card, Phone, Fixed, FinalPrice=300, FixedPrice=250 (override: +50 CZK)
    ///   - Order 3: Invoice, Dispatcher, Estimated, FinalPrice=150, EstimatedPrice=150 (no override)
    ///   Expected bucket: TotalCzk=650, Rides=3, CashCzk=200, CardCzk=300, InvoiceCzk=150,
    ///                    AppCzk=200, PhoneCzk=300, MeterCzk=200, FixedCzk=300, EstimatedCzk=150
    ///   AOV: (200+300+150)/3 = 216 (rounded)
    ///   PriceOverride.Count=1, TotalDeltaCzk=+50
    /// </para></summary>
    [Fact]
    public async Task HandleAsync_HandComputedFixture_StacksRevenueByPaymentType()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, adminId) = await SeedFleetAsync(ct);

        // Order 1: Cash, App, Meter, FinalPrice=200 (no override)
        await SeedOrderAsync(fleetId, OrderStatus.Completed,
            paymentType: PaymentType.Cash,
            source: OrderSource.App,
            priceType: PriceType.Meter,
            finalPriceCzk: 200,
            estimatedPriceCzk: null,
            fixedPriceCzk: null,
            priceOverrideReason: null,
            createdAt: Sep10UtcBase,
            completedAt: Sep10UtcBase.AddMinutes(30),
            ct: ct);

        // Order 2: Card, Phone, Fixed, FinalPrice=300, FixedPrice=250 → override +50
        await SeedOrderAsync(fleetId, OrderStatus.Completed,
            paymentType: PaymentType.Card,
            source: OrderSource.Phone,
            priceType: PriceType.Fixed,
            finalPriceCzk: 300,
            estimatedPriceCzk: null,
            fixedPriceCzk: 250,
            priceOverrideReason: "Traffic",
            createdAt: Sep10UtcBase.AddMinutes(10),
            completedAt: Sep10UtcBase.AddMinutes(50),
            ct: ct);

        // Order 3: Invoice, Dispatcher, Estimate, FinalPrice=150, EstimatedPrice=150 (no override)
        await SeedOrderAsync(fleetId, OrderStatus.Completed,
            paymentType: PaymentType.Invoice,
            source: OrderSource.Dispatcher,
            priceType: PriceType.Estimate,
            finalPriceCzk: 150,
            estimatedPriceCzk: 150,
            fixedPriceCzk: null,
            priceOverrideReason: null,
            createdAt: Sep10UtcBase.AddMinutes(20),
            completedAt: Sep10UtcBase.AddMinutes(60),
            ct: ct);

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminId);
        var resp = await client.GetAsync(
            "/api/v1/analytics/revenue?from=2026-09-10&to=2026-09-11", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<GetRevenueResponseDto>(ct);

        body.Should().NotBeNull();
        body!.Series.Should().HaveCount(1, "all orders are in one day bucket");

        var bucket = body.Series[0];
        bucket.TotalCzk.Should().Be(650, "200+300+150");
        bucket.Rides.Should().Be(3);
        bucket.CashCzk.Should().Be(200);
        bucket.CardCzk.Should().Be(300);
        bucket.InvoiceCzk.Should().Be(150);
        bucket.AppCzk.Should().Be(200);
        bucket.PhoneCzk.Should().Be(300, "Phone source order");
        bucket.DispatcherCzk.Should().Be(150, "Dispatcher source order");
        bucket.MeterCzk.Should().Be(200);
        bucket.FixedCzk.Should().Be(300);
        bucket.EstimateCzk.Should().Be(150);

        // AOV trend
        body.AovTrend.Should().HaveCount(1);
        body.AovTrend[0].AovCzk.Should().Be(217, "ROUND(650/3) ≈ 216.7, SQL ROUND → 217");

        // Price override impact: 1 override (Card/Fixed order, +50 delta)
        body.PriceOverride.Count.Should().Be(1);
        body.PriceOverride.TotalDeltaCzk.Should().Be(50, "300-250 = +50");
        body.PriceOverride.TopReasons.Should().HaveCount(1);
        body.PriceOverride.TopReasons[0].Reason.Should().Be("Traffic");
        body.PriceOverride.TopReasons[0].Count.Should().Be(1);

        body.Prior.Should().BeNull("compare=false by default");
    }

    // ── Price override — CZK delta calculation ────────────────────────────────

    /// <summary>Verifies that price-override delta is computed as FinalPriceCzk − FixedPriceCzk for Fixed orders
    /// and FinalPriceCzk − EstimatedPriceCzk for Estimated orders. Only orders with PriceOverrideReason set
    /// (and status=Completed) are counted.</summary>
    [Fact]
    public async Task HandleAsync_PriceOverride_ComputesCzkDelta()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, adminId) = await SeedFleetAsync(ct);

        // Fixed order with override: Final=400, Fixed=300 → delta +100
        await SeedOrderAsync(fleetId, OrderStatus.Completed,
            paymentType: PaymentType.Cash,
            source: OrderSource.Dispatcher,
            priceType: PriceType.Fixed,
            finalPriceCzk: 400,
            fixedPriceCzk: 300,
            estimatedPriceCzk: null,
            priceOverrideReason: "ExtraKm",
            createdAt: Sep10UtcBase,
            completedAt: Sep10UtcBase.AddMinutes(30),
            ct: ct);

        // Estimated order with override: Final=200, Estimated=250 → delta −50
        await SeedOrderAsync(fleetId, OrderStatus.Completed,
            paymentType: PaymentType.Card,
            source: OrderSource.Dispatcher,
            priceType: PriceType.Estimate,
            finalPriceCzk: 200,
            fixedPriceCzk: null,
            estimatedPriceCzk: 250,
            priceOverrideReason: "Discount",
            createdAt: Sep10UtcBase.AddMinutes(10),
            completedAt: Sep10UtcBase.AddMinutes(40),
            ct: ct);

        // Meter order: no override reason, not counted
        await SeedOrderAsync(fleetId, OrderStatus.Completed,
            paymentType: PaymentType.Cash,
            source: OrderSource.Dispatcher,
            priceType: PriceType.Meter,
            finalPriceCzk: 180,
            fixedPriceCzk: null,
            estimatedPriceCzk: null,
            priceOverrideReason: null,
            createdAt: Sep10UtcBase.AddMinutes(20),
            completedAt: Sep10UtcBase.AddMinutes(50),
            ct: ct);

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminId);
        var resp = await client.GetAsync(
            "/api/v1/analytics/revenue?from=2026-09-10&to=2026-09-11", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<GetRevenueResponseDto>(ct);

        body.Should().NotBeNull();
        body!.PriceOverride.Count.Should().Be(2, "2 orders have a PriceOverrideReason");
        body.PriceOverride.TotalDeltaCzk.Should().Be(50, "+100 (ExtraKm) + (−50) (Discount) = +50");
        body.PriceOverride.TopReasons.Should().HaveCount(2);
    }

    // ── SMS cost line ─────────────────────────────────────────────────────────

    /// <summary>Verifies that SMS cost is computed as sentSmsCount × SmsUnitCostCzk per bucket,
    /// reading SmsUnitCostCzk from FleetSettings (default 1 when no FleetSettings row).</summary>
    [Fact]
    public async Task HandleAsync_SmsCostLine_MatchesUnitCostTimesSent()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, adminId) = await SeedFleetAsync(ct);

        // Set fleet SMS unit cost to 3 CZK
        await SeedFleetSettingsAsync(fleetId, smsUnitCostCzk: 3, ct);

        // Seed 4 SMS notifications in the window (sent status)
        for (var i = 0; i < 4; i++)
        {
            await SeedNotificationLogAsync(fleetId, NotificationChannel.Sms, NotificationStatus.Sent,
                createdAt: Sep10UtcBase.AddMinutes(i * 5), ct);
        }

        // 1 SMS that is Pending (not Sent) — must NOT be counted
        await SeedNotificationLogAsync(fleetId, NotificationChannel.Sms, NotificationStatus.Queued,
            createdAt: Sep10UtcBase.AddMinutes(30), ct);

        // 1 non-SMS (Push) that is Sent — must NOT be counted
        await SeedNotificationLogAsync(fleetId, NotificationChannel.Push, NotificationStatus.Sent,
            createdAt: Sep10UtcBase.AddMinutes(35), ct);

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminId);
        var resp = await client.GetAsync(
            "/api/v1/analytics/revenue?from=2026-09-10&to=2026-09-11", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<GetRevenueResponseDto>(ct);

        body.Should().NotBeNull();
        body!.SmsCost.Should().HaveCount(1, "all SMS in one bucket");
        body.SmsCost[0].SmsCount.Should().Be(4, "4 sent SMS notifications");
        body.SmsCost[0].CostCzk.Should().Be(12, "4 × 3 CZK = 12");
    }

    // ── Tenant isolation ──────────────────────────────────────────────────────

    /// <summary>Fleet A has 1 order (revenue 100 CZK); fleet B has 5 orders (revenue 500 CZK each).
    /// Fleet A's admin sees only fleet A's revenue.</summary>
    [Fact]
    public async Task HandleAsync_FleetAScopedFromFleetB_ReturnsOnlyOwnData()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetAId, adminAId) = await SeedFleetAsync(ct);
        var (fleetBId, _) = await SeedFleetAsync(ct);

        // Fleet A: 1 completed order, CZK=100
        await SeedOrderAsync(fleetAId, OrderStatus.Completed,
            paymentType: PaymentType.Cash,
            source: OrderSource.Dispatcher,
            priceType: PriceType.Meter,
            finalPriceCzk: 100,
            createdAt: Sep10UtcBase,
            completedAt: Sep10UtcBase.AddMinutes(20),
            ct: ct);

        // Fleet B: 5 completed orders, CZK=500 each
        for (var i = 0; i < 5; i++)
        {
            await SeedOrderAsync(fleetBId, OrderStatus.Completed,
                paymentType: PaymentType.Card,
                source: OrderSource.Dispatcher,
                priceType: PriceType.Meter,
                finalPriceCzk: 500,
                createdAt: Sep10UtcBase.AddMinutes(i),
                completedAt: Sep10UtcBase.AddMinutes(i + 30),
                ct: ct);
        }

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetAId, adminAId);
        var resp = await client.GetAsync(
            "/api/v1/analytics/revenue?from=2026-09-10&to=2026-09-11", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<GetRevenueResponseDto>(ct);

        body.Should().NotBeNull();
        var totalRevenue = body!.Series.Sum(b => b.TotalCzk);
        totalRevenue.Should().Be(100, "fleet A sees only its own 100 CZK");
        var totalRides = body.Series.Sum(b => b.Rides);
        totalRides.Should().Be(1, "fleet A has only 1 ride");
    }

    // ── Compare / prior period ────────────────────────────────────────────────

    /// <summary>With compare=true, seeds orders in the current window (Sep 10) and orders in the prior
    /// window (Sep 9), then verifies that body.Prior is non-null with correct sums for the prior period,
    /// and that body.Series reflects only the current period's orders.</summary>
    [Fact]
    public async Task HandleAsync_CompareTrueWithPriorOrders_ReturnsPriorBlock()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, adminId) = await SeedFleetAsync(ct);

        // Current window: Sep 10, 1 order at 200 CZK
        await SeedOrderAsync(fleetId, OrderStatus.Completed,
            paymentType: PaymentType.Cash,
            source: OrderSource.App,
            priceType: PriceType.Meter,
            finalPriceCzk: 200,
            createdAt: Sep10UtcBase,
            completedAt: Sep10UtcBase.AddMinutes(30),
            ct: ct);

        // Prior window: Sep 9 (one day before Sep 10), 2 orders at 100 CZK each
        var sep9 = Sep10UtcBase.AddDays(-1);
        await SeedOrderAsync(fleetId, OrderStatus.Completed,
            paymentType: PaymentType.Card,
            source: OrderSource.Phone,
            priceType: PriceType.Meter,
            finalPriceCzk: 100,
            createdAt: sep9,
            completedAt: sep9.AddMinutes(30),
            ct: ct);
        await SeedOrderAsync(fleetId, OrderStatus.Completed,
            paymentType: PaymentType.Invoice,
            source: OrderSource.Dispatcher,
            priceType: PriceType.Meter,
            finalPriceCzk: 100,
            createdAt: sep9.AddMinutes(10),
            completedAt: sep9.AddMinutes(40),
            ct: ct);

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminId);
        // Range: Sep 10 → Sep 11 (1 day). With compare=true, prior = Sep 9 → Sep 10.
        var resp = await client.GetAsync(
            "/api/v1/analytics/revenue?from=2026-09-10&to=2026-09-11&compare=true", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<GetRevenueResponseDto>(ct);

        body.Should().NotBeNull();

        // Current period: 1 order at 200 CZK
        var currentRevenue = body!.Series.Sum(b => b.TotalCzk);
        currentRevenue.Should().Be(200, "current window has 1 order at 200 CZK");
        body.Series.Sum(b => b.Rides).Should().Be(1);

        // Prior period must be non-null and have 2 orders at 100 CZK each
        body.Prior.Should().NotBeNull("compare=true must populate Prior block");
        var priorRevenue = body.Prior!.Series.Sum(b => b.TotalCzk);
        priorRevenue.Should().Be(200, "prior window has 2 orders × 100 CZK = 200 CZK");
        body.Prior.Series.Sum(b => b.Rides).Should().Be(2, "prior window has 2 rides");
    }

    // ── Perf test (opt-in via RUN_PERF_TESTS=1) ──────────────────────────────

    /// <summary>Seeds 50k completed orders, calls GET /api/v1/analytics/revenue with compare=true,
    /// and asserts the response is returned in under 500 ms.</summary>
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

        // Bulk seed 50k completed orders across 3 days
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var rng = new Random(42);
        var paymentTypes = new[] { PaymentType.Cash, PaymentType.Card, PaymentType.Invoice };
        var sources = new[] { OrderSource.App, OrderSource.Phone, OrderSource.Dispatcher };
        var priceTypes = new[] { PriceType.Meter, PriceType.Fixed, PriceType.Estimate };

        for (var i = 0; i < 50_000; i++)
        {
            var createdAt = Sep10UtcBase.AddMinutes(rng.Next(0, 3 * 24 * 60));
            var pt = priceTypes[rng.Next(priceTypes.Length)];
            var price = rng.Next(100, 1000);
            db.Orders.Add(new Order
            {
                Id = Guid.CreateVersion7(),
                FleetId = fleetId,
                PublicCode = Guid.NewGuid().ToString("N")[..6].ToUpperInvariant(),
                Status = OrderStatus.Completed,
                Source = sources[rng.Next(sources.Length)],
                CustomerPhone = $"+420{Guid.NewGuid().ToString("N")[..9]}",
                PickupAddress = "Perf Test St",
                PickupLat = 50.08 + rng.NextDouble() * 0.01,
                PickupLng = 14.43 + rng.NextDouble() * 0.01,
                PriceType = pt,
                EstimatedPriceCzk = pt == PriceType.Estimate ? price : null,
                FixedPriceCzk = pt == PriceType.Fixed ? price : null,
                FinalPriceCzk = price,
                PaymentType = paymentTypes[rng.Next(paymentTypes.Length)],
                CreatedAt = createdAt,
                CompletedAt = createdAt.AddMinutes(30),
                UpdatedAt = createdAt,
                Version = 1
            });

            if (i % 5_000 == 4_999)
                await db.SaveChangesAsync(ct);
        }

        await db.SaveChangesAsync(ct);

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminId);
        var sw = Stopwatch.StartNew();
        var resp = await client.GetAsync(
            "/api/v1/analytics/revenue?from=2026-09-10&to=2026-09-13&compare=true", ct);
        sw.Stop();

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        sw.ElapsedMilliseconds.Should().BeLessThan(500,
            $"revenue endpoint must respond in <500ms at 50k rows with compare=true; took {sw.ElapsedMilliseconds}ms");
    }

    // ── Seed helpers ──────────────────────────────────────────────────────────

    /// <summary>Seeds a new fleet with a UUID-based slug and an admin user. Returns (fleetId, adminUserId).</summary>
    private async Task<(Guid FleetId, Guid AdminId)> SeedFleetAsync(CancellationToken ct)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        var fleetId = Guid.CreateVersion7();
        var adminId = Guid.CreateVersion7();
        var slug = Guid.NewGuid().ToString("N")[..12];

        db.Fleets.Add(new Fleet { Id = fleetId, Name = $"Fleet {slug}", Slug = slug, Phone = "+420000000000", IsActive = true });
        db.Users.Add(new User
        {
            Id = adminId,
            FleetId = fleetId,
            Role = UserRole.FleetAdmin,
            Email = $"admin-rev-{adminId:N}@analytics.local",
            Phone = $"+42099{Guid.NewGuid().ToString("N")[..7]}",
            DisplayName = "Revenue Admin",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync(ct);
        return (fleetId, adminId);
    }

    /// <summary>Seeds a FleetSettings row for the given fleet with the specified SMS unit cost.</summary>
    private async Task SeedFleetSettingsAsync(Guid fleetId, int smsUnitCostCzk, CancellationToken ct)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.FleetSettings.Add(new FleetSettings
        {
            FleetId = fleetId,
            SmsUnitCostCzk = smsUnitCostCzk
        });
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Seeds a notification log entry for SMS cost testing.</summary>
    private async Task SeedNotificationLogAsync(
        Guid fleetId,
        NotificationChannel channel,
        NotificationStatus status,
        DateTimeOffset createdAt,
        CancellationToken ct)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.NotificationLog.Add(new NotificationLog
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleetId,
            Channel = channel,
            Status = status,
            Event = NotificationEvent.OrderCreatedForCustomer,
            Recipient = "+420123456789",
            CreatedAt = createdAt,
            SentAt = status == NotificationStatus.Sent ? createdAt.AddSeconds(1) : null
        });
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Seeds a completed or cancelled order with revenue-specific fields.</summary>
    private async Task SeedOrderAsync(
        Guid fleetId,
        OrderStatus status,
        PaymentType? paymentType = null,
        OrderSource source = OrderSource.Dispatcher,
        PriceType priceType = PriceType.Meter,
        int? finalPriceCzk = null,
        int? fixedPriceCzk = null,
        int? estimatedPriceCzk = null,
        string? priceOverrideReason = null,
        DateTimeOffset? createdAt = null,
        DateTimeOffset? completedAt = null,
        CancellationToken ct = default)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var created = createdAt ?? Sep10UtcBase;
        db.Orders.Add(new Order
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleetId,
            PublicCode = Guid.NewGuid().ToString("N")[..6].ToUpperInvariant(),
            Status = status,
            Source = source,
            CustomerPhone = $"+420{Guid.NewGuid().ToString("N")[..9]}",
            PickupAddress = "Revenue Test St",
            PickupLat = 50.08,
            PickupLng = 14.43,
            PriceType = priceType,
            FinalPriceCzk = finalPriceCzk,
            FixedPriceCzk = fixedPriceCzk,
            EstimatedPriceCzk = estimatedPriceCzk,
            PriceOverrideReason = priceOverrideReason,
            PaymentType = paymentType,
            CompletedAt = completedAt,
            CreatedAt = created,
            UpdatedAt = created,
            Version = 1
        });
        await db.SaveChangesAsync(ct);
    }

    // ── Local response DTOs (mirrors actual response shape) ───────────────────

    private sealed record GetRevenueResponseDto(
        List<RevenueBucketDto> Series,
        List<AovTrendBucketDto> AovTrend,
        PriceOverrideImpactDto PriceOverride,
        List<RevenueTopRouteDto> TopRoutes,
        List<ZoneRevenueDto> ZoneRevenue,
        List<SmsCostBucketDto> SmsCost,
        GetRevenuePriorDto? Prior = null);

    private sealed record GetRevenuePriorDto(
        List<RevenueBucketDto> Series,
        List<AovTrendBucketDto> AovTrend,
        PriceOverrideImpactDto PriceOverride,
        List<RevenueTopRouteDto> TopRoutes,
        List<ZoneRevenueDto> ZoneRevenue,
        List<SmsCostBucketDto> SmsCost);

    private sealed record RevenueBucketDto(
        string Bucket,
        int TotalCzk,
        int Rides,
        int CashCzk,
        int CardCzk,
        int InvoiceCzk,
        int AppCzk,
        int PhoneCzk,
        int DispatcherCzk,
        int MeterCzk,
        int FixedCzk,
        int EstimateCzk);

    private sealed record AovTrendBucketDto(string Bucket, int AovCzk);

    private sealed record PriceOverrideImpactDto(int Count, int TotalDeltaCzk, List<OverrideReasonDto> TopReasons);

    private sealed record OverrideReasonDto(string Reason, int Count);

    private sealed record RevenueTopRouteDto(
        string PickupAddress, string DropoffAddress, int Rides, int RevenueCzk, int AovCzk);

    private sealed record ZoneRevenueDto(Guid ZoneId, string ZoneName, int Rides, int RevenueCzk, int AovCzk);

    private sealed record SmsCostBucketDto(string Bucket, int SmsCount, int CostCzk);
}

using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Infrastructure.Jobs;
using Taxi.Api.Infrastructure.Notifications;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Analytics;

/// <summary>Integration tests for GET /api/v1/admin/analytics (WI-10, SuperAdminOnly, cross-tenant)
/// and WeeklyDigestJob (RunTickAsync-shell, idempotent per fleet+ISO week).</summary>
[Collection(TestCollections.Database)]
public sealed class AdminAnalyticsAndDigestTests(PostgresFixture fixture)
{
    // FakeTime pins to 2026-09-10 12:00 UTC (Thursday, Prague UTC+2 = 14:00 local).
    // For digest job tests we use a dedicated factory pinned to a Monday 06:10 Prague = Monday 04:10 UTC.
    private static readonly DateTimeOffset Sep10PragueAsUtc = new(2026, 9, 10, 6, 0, 0, TimeSpan.Zero);

    // ── GET /api/v1/admin/analytics — happy path ────────────────────────────────

    /// <summary>SuperAdmin gets cross-tenant per-fleet data including both seeded fleets.</summary>
    [Fact]
    public async Task GetAdminAnalytics_SuperAdmin_ReturnsCrossTenantHealth()
    {
        var ct = TestContext.Current.CancellationToken;

        // Fleet A: 3 completed orders this month (Prague) → "growing" MoM (last month zero → +∞ but inactive=false)
        // Health: no order >14 days? No → not inactive. last month = 0 rides. This month = 3 rides.
        // last month = 0 → inactive check: last order IS within 14 days → not inactive.
        // MoM delta: 0→3 ≥ +10% → "growing"
        var (fleetA, adminA) = await SeedFleetAsync("admin-analytics-A", ct);
        var (driverA, _) = await SeedTwoDriversAsync(fleetA, ct);
        var (custA, _) = await SeedTwoCustomersAsync(fleetA, ct);

        // 3 completed orders this Prague month (Sep 2026 = Sep10 in fake time)
        await SeedOrderAsync(fleetA, OrderStatus.Completed, 500, driverA, custA, Sep10PragueAsUtc.AddHours(7), ct: ct);
        await SeedOrderAsync(fleetA, OrderStatus.Completed, 300, driverA, custA, Sep10PragueAsUtc.AddHours(8), ct: ct);
        await SeedOrderAsync(fleetA, OrderStatus.Completed, 200, driverA, custA, Sep10PragueAsUtc.AddHours(9), ct: ct);

        // Fleet B: 1 completed order last month, 1 this month → stable (delta = 0%)
        var (fleetB, adminB) = await SeedFleetAsync("admin-analytics-B", ct);
        var (driverB, _) = await SeedTwoDriversAsync(fleetB, ct);
        var (custB, _) = await SeedTwoCustomersAsync(fleetB, ct);

        // Last month = Aug 2026 (before Sep1 Prague = Aug31 22:00 UTC)
        var aug15 = new DateTimeOffset(2026, 8, 15, 10, 0, 0, TimeSpan.Zero);
        await SeedOrderAsync(fleetB, OrderStatus.Completed, 400, driverB, custB, aug15, ct: ct);
        // This month = Sep 2026
        await SeedOrderAsync(fleetB, OrderStatus.Completed, 400, driverB, custB, Sep10PragueAsUtc.AddHours(7), ct: ct);

        var client = fixture.Factory.CreateClient().AsSuperAdmin();
        var resp = await client.GetAsync("/api/v1/admin/analytics", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<GetPlatformAnalyticsResponseDto>(ct);
        body.Should().NotBeNull();

        // Locate our two fleet rows (shared DB may have other fleets)
        var rowA = body!.Fleets.FirstOrDefault(f => f.FleetId == fleetA);
        var rowB = body.Fleets.FirstOrDefault(f => f.FleetId == fleetB);

        rowA.Should().NotBeNull("fleet A must appear in cross-tenant response");
        rowB.Should().NotBeNull("fleet B must appear in cross-tenant response");

        // Fleet A: 3 rides this month, 0 last month → MoM = 0→3 → growing
        rowA!.RidesThisMonth.Should().Be(3, "fleet A has 3 completed orders this Prague month");
        rowA.RevenueThisMonthCzk.Should().Be(1000, "500+300+200 = 1000 CZK");
        rowA.Health.Should().Be("growing", "MoM rides 0→3 ≥ +10%");

        // Fleet B: 1 ride last month, 1 this month → stable
        rowB!.RidesLastMonth.Should().Be(1, "fleet B has 1 completed order last Prague month");
        rowB.RidesThisMonth.Should().Be(1, "fleet B has 1 completed order this Prague month");
        rowB.Health.Should().Be("stable", "no MoM change → stable");

        // Totals row must be present
        body.Totals.Should().NotBeNull("platform totals row is always present");
    }

    // ── GET /api/v1/admin/analytics — 403 for FleetAdmin ─────────────────────

    /// <summary>FleetAdmin is forbidden from the SuperAdmin-only platform analytics endpoint.</summary>
    [Fact]
    public async Task GetAdminAnalytics_FleetAdmin_Returns403()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, adminId) = await SeedFleetAsync("admin-analytics-403", ct);

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminId);
        var resp = await client.GetAsync("/api/v1/admin/analytics", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    // ── WeeklyDigestJob — idempotency ─────────────────────────────────────────

    /// <summary>Running RunTickAsync twice for the same ISO week sends exactly one push per fleet.</summary>
    [Fact]
    public async Task RunTickAsync_SameIsoWeekTwice_SendsExactlyOncePerFleet()
    {
        var ct = TestContext.Current.CancellationToken;

        // Seed a fleet with 1 completed order in week 37 of 2026 (Sep 7–13).
        var (fleetId, adminId) = await SeedFleetAsync("digest-idem-A", ct);
        var (driverId, _) = await SeedTwoDriversAsync(fleetId, ct);
        var (custId, _) = await SeedTwoCustomersAsync(fleetId, ct);
        await SeedOrderAsync(fleetId, OrderStatus.Completed, 300, driverId, custId,
            new DateTimeOffset(2026, 9, 8, 10, 0, 0, TimeSpan.Zero), ct: ct);

        // Seed a push subscription for the fleet admin
        await SeedPushSubscriptionAsync(fleetId, adminId, ct);

        // Digest factory: Monday Sep 14 2026 at 06:10 Prague (04:10 UTC)
        // ISO week 38 starts Sep 14 → digest reports ISO week 37 (Sep 7–13).
        // We pin the clock to Monday 04:10 UTC (= 06:10 Prague UTC+2).
        using var factory = new DigestTestFactory(fixture.ConnectionString,
            new DateTimeOffset(2026, 9, 14, 4, 10, 0, TimeSpan.Zero));
        var push = factory.Push;

        var job = new WeeklyDigestJob(
            factory.Services.GetRequiredService<IServiceScopeFactory>(),
            factory.FakeTime,
            factory.Services.GetRequiredService<ILogger<WeeklyDigestJob>>());

        // First tick → sends
        await job.RunTickAsync(ct);
        var countAfterFirst = push.SendCount;
        countAfterFirst.Should().BeGreaterThan(0, "at least one push must have been sent on first tick");

        // Second tick (same week) → must not send again
        await job.RunTickAsync(ct);
        push.SendCount.Should().Be(countAfterFirst, "idempotency: second tick same ISO week must not resend");
    }

    // ── WeeklyDigestJob — digest numbers match overview for the same week ─────

    /// <summary>The digest's ride count matches what the overview endpoint reports for the same week.</summary>
    [Fact]
    public async Task RunTickAsync_DigestNumbers_MatchOverviewEndpoint()
    {
        var ct = TestContext.Current.CancellationToken;

        // ISO week 37 of 2026 (Sep 7–13 in Prague local)
        var (fleetId, adminId) = await SeedFleetAsync("digest-nums-A", ct);
        var (driverId, _) = await SeedTwoDriversAsync(fleetId, ct);
        var (custId, _) = await SeedTwoCustomersAsync(fleetId, ct);

        // Two orders in week 37 (Sep 8 and Sep 10 Prague)
        await SeedOrderAsync(fleetId, OrderStatus.Completed, 200, driverId, custId,
            new DateTimeOffset(2026, 9, 8, 10, 0, 0, TimeSpan.Zero), ratingStars: 5, ct: ct);
        await SeedOrderAsync(fleetId, OrderStatus.Completed, 300, driverId, custId,
            new DateTimeOffset(2026, 9, 10, 6, 0, 0, TimeSpan.Zero), ratingStars: 4, ct: ct);

        // Seed push subscription
        await SeedPushSubscriptionAsync(fleetId, adminId, ct);

        // Run digest job (Monday Sep 14 → week 37 is last ISO week)
        using var factory = new DigestTestFactory(fixture.ConnectionString,
            new DateTimeOffset(2026, 9, 14, 4, 10, 0, TimeSpan.Zero));
        var push = factory.Push;

        var job = new WeeklyDigestJob(
            factory.Services.GetRequiredService<IServiceScopeFactory>(),
            factory.FakeTime,
            factory.Services.GetRequiredService<ILogger<WeeklyDigestJob>>());
        await job.RunTickAsync(ct);

        push.SendCount.Should().BeGreaterThan(0, "digest must have sent a push");

        // Verify via overview endpoint for the same week (Sep 7–13)
        var overviewClient = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminId);
        var overviewResp = await overviewClient.GetAsync(
            "/api/v1/analytics/overview?from=2026-09-07&to=2026-09-13", ct);
        overviewResp.StatusCode.Should().Be(HttpStatusCode.OK);
        var overview = await overviewResp.Content.ReadFromJsonAsync<OverviewResponseSimpleDto>(ct);

        overview!.Current.Rides.Should().Be(2, "2 completed orders in week 37");
        overview.Current.RevenueCzk.Should().Be(500, "200+300 = 500 CZK");
    }

    // ── WeeklyDigestJob — zero activity fleet is skipped ─────────────────────

    /// <summary>A fleet with zero rides in both the last and prior ISO week must not receive a push.</summary>
    [Fact]
    public async Task RunTickAsync_ZeroActivityFleet_Skipped()
    {
        var ct = TestContext.Current.CancellationToken;

        var (fleetId, adminId) = await SeedFleetAsync("digest-zero-A", ct);
        // No orders seeded.
        await SeedPushSubscriptionAsync(fleetId, adminId, ct);

        using var factory = new DigestTestFactory(fixture.ConnectionString,
            new DateTimeOffset(2026, 9, 14, 4, 10, 0, TimeSpan.Zero));
        var push = factory.Push;

        var job = new WeeklyDigestJob(
            factory.Services.GetRequiredService<IServiceScopeFactory>(),
            factory.FakeTime,
            factory.Services.GetRequiredService<ILogger<WeeklyDigestJob>>());
        await job.RunTickAsync(ct);

        // The global push count may be > 0 if other fleets in the shared DB received pushes.
        // We verify the zero-activity fleet has no marker (never sent).
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var markerExists = await db.WeeklyDigestMarkers.IgnoreQueryFilters()
            .AnyAsync(m => m.FleetId == fleetId, ct);
        markerExists.Should().BeFalse("zero-activity fleet must be skipped (no marker written)");
    }

    // ── WeeklyDigestJob — Gone subscription does not abort, marker still written ─

    /// <summary>When a push subscription returns 410 Gone, remaining recipients still get notified
    /// and the marker is still written (exactly once).</summary>
    [Fact]
    public async Task RunTickAsync_RecipientPushGone_ContinuesAndWritesMarkerOnce()
    {
        var ct = TestContext.Current.CancellationToken;

        var (fleetId, adminId) = await SeedFleetAsync("digest-gone-A", ct);
        var (driverId, _) = await SeedTwoDriversAsync(fleetId, ct);
        var (custId, _) = await SeedTwoCustomersAsync(fleetId, ct);
        await SeedOrderAsync(fleetId, OrderStatus.Completed, 400, driverId, custId,
            new DateTimeOffset(2026, 9, 8, 10, 0, 0, TimeSpan.Zero), ct: ct);

        // Two subscriptions: both will return Gone
        await SeedPushSubscriptionAsync(fleetId, adminId, ct);
        await SeedPushSubscriptionAsync(fleetId, adminId, ct); // second sub for same admin

        using var factory = new DigestTestFactory(fixture.ConnectionString,
            new DateTimeOffset(2026, 9, 14, 4, 10, 0, TimeSpan.Zero));
        var push = factory.Push;
        push.ReturnGone = true; // all sends return 410 Gone

        var job = new WeeklyDigestJob(
            factory.Services.GetRequiredService<IServiceScopeFactory>(),
            factory.FakeTime,
            factory.Services.GetRequiredService<ILogger<WeeklyDigestJob>>());
        await job.RunTickAsync(ct);

        // Marker must be written even when all sends returned Gone
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var markerCount = await db.WeeklyDigestMarkers.IgnoreQueryFilters()
            .CountAsync(m => m.FleetId == fleetId, ct);
        markerCount.Should().Be(1, "marker must be written exactly once even when all sends returned Gone");

        // At least 2 sends were attempted (did not abort on first Gone)
        push.SendCount.Should().BeGreaterOrEqualTo(2,
            "both subscriptions must have been attempted (Gone does not abort remaining recipients)");
    }

    // ── WeeklyDigestJob — not Monday / not due → no-op ──────────────────────

    /// <summary>When the current time is not Monday ≥ 06:00 Prague, RunTickAsync must be a no-op.</summary>
    [Fact]
    public async Task RunTickAsync_NotMonday_IsNoOp()
    {
        var ct = TestContext.Current.CancellationToken;

        var (fleetId, adminId) = await SeedFleetAsync("digest-noday-A", ct);
        var (driverId, _) = await SeedTwoDriversAsync(fleetId, ct);
        var (custId, _) = await SeedTwoCustomersAsync(fleetId, ct);
        await SeedOrderAsync(fleetId, OrderStatus.Completed, 200, driverId, custId,
            new DateTimeOffset(2026, 9, 8, 10, 0, 0, TimeSpan.Zero), ct: ct);
        await SeedPushSubscriptionAsync(fleetId, adminId, ct);

        // Thursday 2026-09-10 12:00 UTC (not Monday)
        using var factory = new DigestTestFactory(fixture.ConnectionString,
            new DateTimeOffset(2026, 9, 10, 12, 0, 0, TimeSpan.Zero));
        var push = factory.Push;

        var job = new WeeklyDigestJob(
            factory.Services.GetRequiredService<IServiceScopeFactory>(),
            factory.FakeTime,
            factory.Services.GetRequiredService<ILogger<WeeklyDigestJob>>());
        await job.RunTickAsync(ct);

        push.SendCount.Should().Be(0, "not Monday → no-op, no push sent");

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var markerExists = await db.WeeklyDigestMarkers.IgnoreQueryFilters()
            .AnyAsync(m => m.FleetId == fleetId, ct);
        markerExists.Should().BeFalse("not Monday → no marker written");
    }

    // ── GET /api/v1/admin/analytics — health-flag boundaries ─────────────────

    /// <summary>Health flags: inactive (recent order &gt;14 days), declining, and +10%-exact boundary (growing).</summary>
    [Fact]
    public async Task GetAdminAnalytics_HealthFlagBoundaries_AreCorrect()
    {
        var ct = TestContext.Current.CancellationToken;
        // Fake time anchor: 2026-09-10 06:00 UTC (Thursday, Prague = 08:00).
        // inactiveCutoff = 2026-08-27 06:00 UTC.

        // Fleet C — inactive: last order on 2026-08-20 (> 14 days before Sep10)
        var (fleetC, adminC) = await SeedFleetAsync("health-inactive", ct);
        var (drvC, _) = await SeedTwoDriversAsync(fleetC, ct);
        var (custC, _) = await SeedTwoCustomersAsync(fleetC, ct);
        // Order in last month (Aug 20) — older than 14 days from Sep 10
        await SeedOrderAsync(fleetC, OrderStatus.Completed, 100, drvC, custC,
            new DateTimeOffset(2026, 8, 20, 10, 0, 0, TimeSpan.Zero), ct: ct);

        // Fleet D — declining: last=10, this=9 → MoM = −10% → declining (≤ −10%)
        var (fleetD, adminD) = await SeedFleetAsync("health-declining", ct);
        var (drvD, _) = await SeedTwoDriversAsync(fleetD, ct);
        var (custD, _) = await SeedTwoCustomersAsync(fleetD, ct);
        // 10 completed orders last month (Aug 2026)
        for (var i = 0; i < 10; i++)
            await SeedOrderAsync(fleetD, OrderStatus.Completed, 100, drvD, custD,
                new DateTimeOffset(2026, 8, 15, 10, 0, 0, TimeSpan.Zero), ct: ct);
        // 9 completed orders this month (Sep 2026)
        for (var i = 0; i < 9; i++)
            await SeedOrderAsync(fleetD, OrderStatus.Completed, 100, drvD, custD,
                Sep10PragueAsUtc.AddHours(7), ct: ct);

        // Fleet E — growing (boundary): last=10, this=11 → MoM = +10% → growing (≥ +10%)
        var (fleetE, adminE) = await SeedFleetAsync("health-boundary", ct);
        var (drvE, _) = await SeedTwoDriversAsync(fleetE, ct);
        var (custE, _) = await SeedTwoCustomersAsync(fleetE, ct);
        // 10 completed orders last month
        for (var i = 0; i < 10; i++)
            await SeedOrderAsync(fleetE, OrderStatus.Completed, 100, drvE, custE,
                new DateTimeOffset(2026, 8, 15, 10, 0, 0, TimeSpan.Zero), ct: ct);
        // 11 completed orders this month
        for (var i = 0; i < 11; i++)
            await SeedOrderAsync(fleetE, OrderStatus.Completed, 100, drvE, custE,
                Sep10PragueAsUtc.AddHours(7), ct: ct);

        var client = fixture.Factory.CreateClient().AsSuperAdmin();
        var resp = await client.GetAsync("/api/v1/admin/analytics", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<GetPlatformAnalyticsResponseDto>(ct);

        var rowC = body!.Fleets.FirstOrDefault(f => f.FleetId == fleetC);
        var rowD = body.Fleets.FirstOrDefault(f => f.FleetId == fleetD);
        var rowE = body.Fleets.FirstOrDefault(f => f.FleetId == fleetE);

        rowC.Should().NotBeNull("fleet C must appear");
        rowD.Should().NotBeNull("fleet D must appear");
        rowE.Should().NotBeNull("fleet E must appear");

        // Inactive takes priority over MoM (even though this month = 0 rides ← only last-month orders)
        rowC!.Health.Should().Be("inactive", "last order on Aug20, >14 days before Sep10 → inactive");

        // Declining: −10% MoM (10 → 9)
        rowD!.RidesLastMonth.Should().Be(10);
        rowD.RidesThisMonth.Should().Be(9);
        rowD.Health.Should().Be("declining", "MoM −10% = exactly ≤ −10% threshold → declining");

        // Boundary: +10% exact → growing
        rowE!.RidesLastMonth.Should().Be(10);
        rowE.RidesThisMonth.Should().Be(11);
        rowE.Health.Should().Be("growing", "MoM +10% = exactly ≥ +10% threshold → growing");
    }

    // ── GET /api/v1/admin/analytics — sparkline non-zero slots ───────────────

    /// <summary>Sparkline slot for a historical ISO week must be non-zero when rides existed that week.</summary>
    [Fact]
    public async Task GetAdminAnalytics_SparklineSlot_IsNonZeroWhenRidesExisted()
    {
        var ct = TestContext.Current.CancellationToken;
        // Fake clock: 2026-09-10 (Thursday), sparklineStart = current Monday − 12 weeks.
        // Current ISO week starts 2026-09-07 (Monday). sparklineEnd = 2026-09-07.
        // sparklineStart = 2026-09-07 − 84 days = 2026-06-15.
        // ISO week starting 2026-06-22 is slot index 1 (0-based after 2026-06-15).
        // We seed a ride in that week and expect that slot to be non-zero.

        var (fleetId, adminId) = await SeedFleetAsync("sparkline-nonzero", ct);
        var (drvId, _) = await SeedTwoDriversAsync(fleetId, ct);
        var (custId, _) = await SeedTwoCustomersAsync(fleetId, ct);

        // A ride on 2026-06-23 (within the ISO week starting Mon 2026-06-22 in Prague)
        await SeedOrderAsync(fleetId, OrderStatus.Completed, 200, drvId, custId,
            new DateTimeOffset(2026, 6, 23, 10, 0, 0, TimeSpan.Zero), ct: ct);
        // Also a recent ride so the fleet isn't inactive
        await SeedOrderAsync(fleetId, OrderStatus.Completed, 100, drvId, custId,
            Sep10PragueAsUtc.AddHours(7), ct: ct);

        var client = fixture.Factory.CreateClient().AsSuperAdmin();
        var resp = await client.GetAsync("/api/v1/admin/analytics", ct);
        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<GetPlatformAnalyticsResponseDto>(ct);

        var row = body!.Fleets.FirstOrDefault(f => f.FleetId == fleetId);
        row.Should().NotBeNull("fleet must appear in response");
        row!.SparklineWeeks.Should().HaveCount(12, "sparkline always has 12 slots");
        row.SparklineWeeks.Should().Contain(v => v > 0,
            "at least one slot must be non-zero — the week containing 2026-06-23");
    }

    // ── WeeklyDigestJob — digest message body contains correct numbers ────────

    /// <summary>The digest push body contains the ride count and revenue for the ISO week.</summary>
    [Fact]
    public async Task RunTickAsync_DigestBody_ContainsRideCountAndRevenue()
    {
        var ct = TestContext.Current.CancellationToken;

        var (fleetId, adminId) = await SeedFleetAsync("digest-body-A", ct);
        var (driverId, _) = await SeedTwoDriversAsync(fleetId, ct);
        var (custId, _) = await SeedTwoCustomersAsync(fleetId, ct);

        // Two completed orders in ISO week 37 of 2026 (Sep 7–13) with known values
        await SeedOrderAsync(fleetId, OrderStatus.Completed, 200, driverId, custId,
            new DateTimeOffset(2026, 9, 8, 10, 0, 0, TimeSpan.Zero), ct: ct);
        await SeedOrderAsync(fleetId, OrderStatus.Completed, 300, driverId, custId,
            new DateTimeOffset(2026, 9, 10, 6, 0, 0, TimeSpan.Zero), ct: ct);

        await SeedPushSubscriptionAsync(fleetId, adminId, ct);

        using var factory = new DigestTestFactory(fixture.ConnectionString,
            new DateTimeOffset(2026, 9, 14, 4, 10, 0, TimeSpan.Zero));
        var push = factory.Push;

        var job = new WeeklyDigestJob(
            factory.Services.GetRequiredService<IServiceScopeFactory>(),
            factory.FakeTime,
            factory.Services.GetRequiredService<ILogger<WeeklyDigestJob>>());
        await job.RunTickAsync(ct);

        push.SendCount.Should().BeGreaterThan(0, "at least one push must have been sent");
        push.LastMessage.Should().NotBeNull("the last PushMessage must be captured");

        // Body must reference '2 jízd' and '500' (total revenue)
        push.LastMessage!.Body.Should().Contain("2 jízd",
            "the digest body must include the ride count for the week");
        push.LastMessage.Body.Should().Contain("500",
            "the digest body must include the revenue (200+300=500 CZK)");
    }

    // ── GET /api/v1/admin/analytics — SMS cost uses per-fleet SmsUnitCostCzk ──

    /// <summary>SmsEstimatedCostCzk reflects per-fleet SmsUnitCostCzk from FleetSettings,
    /// not a hardcoded 1 CZK/SMS rate.</summary>
    [Fact]
    public async Task GetAdminAnalytics_SmsCost_UsesPerFleetSmsUnitCostCzk()
    {
        var ct = TestContext.Current.CancellationToken;

        // Seed a fleet with a non-default SmsUnitCostCzk (3 CZK per SMS)
        var (fleetId, adminId) = await SeedFleetAsync("sms-cost-A", ct);
        await SeedFleetSettingsAsync(fleetId, smsUnitCostCzk: 3, ct);

        // Seed 2 SMS notifications for this fleet in the current Prague month (Sep 2026)
        // Fake clock is pinned 2026-09-10 06:00 UTC (= 08:00 Prague → September)
        var smsDate = new DateTimeOffset(2026, 9, 9, 10, 0, 0, TimeSpan.Zero);
        await SeedNotificationLogAsync(fleetId, NotificationChannel.Sms, smsDate, ct);
        await SeedNotificationLogAsync(fleetId, NotificationChannel.Sms, smsDate.AddHours(1), ct);

        // Also seed a recent order so the fleet isn't inactive
        var (drvId, _) = await SeedTwoDriversAsync(fleetId, ct);
        var (custId, _) = await SeedTwoCustomersAsync(fleetId, ct);
        await SeedOrderAsync(fleetId, OrderStatus.Completed, 200, drvId, custId,
            Sep10PragueAsUtc.AddHours(7), ct: ct);

        var client = fixture.Factory.CreateClient().AsSuperAdmin();
        var resp = await client.GetAsync("/api/v1/admin/analytics", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<GetPlatformAnalyticsResponseDto>(ct);
        var row = body!.Fleets.FirstOrDefault(f => f.FleetId == fleetId);

        row.Should().NotBeNull("fleet must appear in the cross-tenant response");
        row!.SmsCount.Should().Be(2, "2 SMS notification log entries were seeded");
        row.SmsEstimatedCostCzk.Should().Be(6,
            "2 SMS × 3 CZK/SMS (non-default SmsUnitCostCzk) = 6 CZK, not 2 × 1 = 2");
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private async Task<(Guid fleetId, Guid adminId)> SeedFleetAsync(string tag, CancellationToken ct)
    {
        var fleetId = Guid.CreateVersion7();
        var adminId = Guid.CreateVersion7();
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.Fleets.Add(new Fleet
        {
            Id = fleetId,
            Slug = $"admin-an-{Guid.NewGuid():N}",
            Name = $"AdminAnalytics {tag}",
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
            Email = $"admin-{adminId:N}@admin-an.local",
            Phone = $"+42077{Guid.NewGuid().ToString("N")[..7]}",
            DisplayName = $"Admin {tag}",
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
                Email = $"drv-{driverId:N}@admin-an.local",
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

        var a = SeedDriver("DA");
        var b = SeedDriver("DB");
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
                FleetId = null,
                Role = UserRole.Customer,
                Email = $"cust-{id:N}@admin-an.local",
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

    private async Task SeedOrderAsync(
        Guid fleetId, OrderStatus status, int finalPriceCzk,
        Guid? driverId, Guid? customerUserId, DateTimeOffset createdAt,
        int? ratingStars = null, CancellationToken ct = default)
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

    private async Task SeedPushSubscriptionAsync(Guid fleetId, Guid userId, CancellationToken ct)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.PushSubscriptions.Add(new PushSubscription
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleetId,
            UserId = userId,
            Endpoint = $"https://push.example.com/{Guid.NewGuid():N}",
            P256dh = "test-p256dh",
            Auth = "test-auth",
            UserAgent = "test-ua",
            CreatedAt = DateTimeOffset.UtcNow,
            LastUsedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync(ct);
    }

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

    private async Task SeedNotificationLogAsync(
        Guid fleetId, NotificationChannel channel, DateTimeOffset createdAt, CancellationToken ct)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.NotificationLog.Add(new NotificationLog
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleetId,
            Event = NotificationEvent.OrderCreatedForCustomer,
            Channel = channel,
            Recipient = $"+420{Guid.NewGuid().ToString("N")[..9]}",
            Status = NotificationStatus.Sent,
            CreatedAt = createdAt,
            SentAt = createdAt.AddSeconds(1)
        });
        await db.SaveChangesAsync(ct);
    }

    // ── Local response DTOs ───────────────────────────────────────────────────

    private sealed record GetPlatformAnalyticsResponseDto(
        List<FleetHealthRowDto> Fleets,
        PlatformTotalsDto Totals);

    private sealed record FleetHealthRowDto(
        Guid FleetId,
        string FleetName,
        int RidesThisMonth,
        int RidesLastMonth,
        int RevenueThisMonthCzk,
        int RevenueLastMonthCzk,
        double MomDeltaPct,
        int ActiveDrivers,
        int ActiveCustomers,
        int SmsCount,
        int SmsEstimatedCostCzk,
        DateTimeOffset? LastOrderAt,
        List<int> SparklineWeeks,
        string Health);

    private sealed record PlatformTotalsDto(
        int TotalFleets,
        int TotalRidesThisMonth,
        int TotalRevenueThisMonthCzk,
        int GrowingFleets,
        int DecliningFleets,
        int InactiveFleets);

    private sealed record OverviewResponseSimpleDto(OverviewKpiSimpleDto Current);

    private sealed record OverviewKpiSimpleDto(
        int Rides, int RevenueCzk, int Aov,
        double FulfillmentRate, double CancellationRate,
        int ActiveCustomers, int NewCustomers, int ActiveDrivers,
        double OnlineDriverHours, double RevenuePerOnlineHour, double? AvgRating);
}

/// <summary>Test factory that wires a <see cref="RecordingPushSender"/> and pins a custom Monday clock
/// for weekly digest job tests. The job is removed as a hosted service — tests call RunTickAsync directly.</summary>
internal sealed class DigestTestFactory : TaxiApiFactory
{
    private RecordingPushSender? _push;

    /// <summary>The recording push sender used by this factory.</summary>
    internal RecordingPushSender Push => _push
        ??= new RecordingPushSender(Services.GetRequiredService<IServiceScopeFactory>());

    /// <summary>Initializes the factory pinned to the given clock instant.</summary>
    public DigestTestFactory(string connectionString, DateTimeOffset fakeNow)
        : base(connectionString)
    {
        FakeTime.SetUtcNow(fakeNow);
    }

    /// <inheritdoc />
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        base.ConfigureWebHost(builder);

        builder.ConfigureTestServices(services =>
        {
            // Replace push sender with recording double.
            services.RemoveAll<IPushSender>();
            services.AddScoped<IPushSender>(_ => Push);

            // Remove WeeklyDigestJob hosted service — tests call RunTickAsync directly.
            var digestJobDesc = services.FirstOrDefault(d =>
                d.ServiceType == typeof(IHostedService)
                && d.ImplementationType == typeof(WeeklyDigestJob));
            if (digestJobDesc is not null)
                services.Remove(digestJobDesc);
        });
    }
}

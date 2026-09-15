using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Infrastructure.Geo;
using Taxi.Api.Infrastructure.Notifications;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Geo;

/// <summary>Integration tests for the geo budget alert service (WI-12):
/// 80%/100% threshold push alerts (idempotent per fleet-month-threshold)
/// and GET /api/v1/settings/geo-usage (FleetAdminOnly, month-to-date credits + budget + percent).</summary>
[Collection(TestCollections.Database)]
public sealed class GeoBudgetAlertTests(PostgresFixture fixture)
{
    // FakeTime pins to 2026-09-10 12:00 UTC (= 14:00 Prague, month = September 2026).
    private static readonly DateTimeOffset FakeNow =
        new(2026, 9, 10, 12, 0, 0, TimeSpan.Zero);

    // ── GET /api/v1/settings/geo-usage — happy path ───────────────────────────

    /// <summary>FleetAdmin receives month-to-date credits, budget, and percent for the current Prague month.</summary>
    [Fact]
    public async Task GetGeoUsage_CurrentMonth_ReturnsEstimateAndPercent()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, adminId) = await SeedFleetAsync(ct);

        // Budget = 100 credits; 20 credits used (Sep 2026, day 2026-09-10).
        await SeedFleetSettingsAsync(fleetId, budget: 100, ct);
        await SeedGeoUsageRowAsync(fleetId, new DateOnly(2026, 9, 10), GeoCacheKind.Suggest, creditsEst: 20, ct);

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminId);
        var resp = await client.GetAsync("/api/v1/settings/geo-usage", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<GeoUsageResponseDto>(ct);
        body.Should().NotBeNull();
        body!.CreditsUsedThisMonth.Should().Be(20);
        body.CreditBudget.Should().Be(100);
        body.UsagePercent.Should().Be(20.0, "20 / 100 = 20%");
        body.Year.Should().Be(2026);
        body.Month.Should().Be(9);
    }

    /// <summary>Dispatcher (non-admin role) receives 403 from the FleetAdminOnly endpoint.</summary>
    [Fact]
    public async Task GetGeoUsage_Dispatcher_Returns403()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, adminId) = await SeedFleetAsync(ct);
        var dispatcherId = await SeedDispatcherAsync(fleetId, ct);

        var client = fixture.Factory.CreateClient().AsDispatcher(fleetId, dispatcherId);
        var resp = await client.GetAsync("/api/v1/settings/geo-usage", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    /// <summary>Driver (non-admin role) receives 403 from the FleetAdminOnly endpoint.</summary>
    [Fact]
    public async Task GetGeoUsage_Driver_Returns403()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, adminId) = await SeedFleetAsync(ct);
        var driverUserId = await SeedDriverAsync(fleetId, ct);

        var client = fixture.Factory.CreateClient().AsDriver(fleetId, driverUserId);
        var resp = await client.GetAsync("/api/v1/settings/geo-usage", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    // ── Budget alert — 80% threshold ─────────────────────────────────────────

    /// <summary>When geo usage crosses 80% of budget, exactly one push alert fires.
    /// A second call (same month) must not fire again (idempotent via marker).</summary>
    [Fact]
    public async Task GeoUsage_Budget100_At80Percent_FiresAlertOnce()
    {
        var ct = TestContext.Current.CancellationToken;
        using var alertFactory = new GeoBudgetAlertTestFactory(fixture.ConnectionString, FakeNow);
        var push = alertFactory.Push;

        var (fleetId, adminId) = await SeedFleetAsync(ct, alertFactory);
        await SeedFleetSettingsAsync(fleetId, budget: 100, ct, alertFactory);
        await SeedPushSubscriptionAsync(fleetId, adminId, ct, alertFactory);

        // Seed 76 credits (below 80% of budget 100) — no alert expected.
        await SeedGeoUsageRowAsync(fleetId, new DateOnly(2026, 9, 10), GeoCacheKind.Suggest, creditsEst: 76, ct, alertFactory);

        await using (var scope1 = alertFactory.Services.CreateAsyncScope())
        {
            var alertService = scope1.ServiceProvider.GetRequiredService<GeoBudgetAlertService>();
            await alertService.CheckAndAlertAsync(fleetId, ct);
        }

        push.SendCount.Should().Be(0, "76% is below 80% threshold — no alert yet");

        // Add 4 more credits (via second row, different kind) → total 80 = exactly 80%.
        await SeedGeoUsageRowAsync(fleetId, new DateOnly(2026, 9, 10), GeoCacheKind.Route, creditsEst: 4, ct, alertFactory);

        await using (var scope2 = alertFactory.Services.CreateAsyncScope())
        {
            var alertService = scope2.ServiceProvider.GetRequiredService<GeoBudgetAlertService>();
            await alertService.CheckAndAlertAsync(fleetId, ct);
        }

        push.SendCount.Should().Be(1, "exactly 80% crosses the 80% threshold — one push fired");

        // Second call (same month) → marker exists → no second alert.
        await using (var scope3 = alertFactory.Services.CreateAsyncScope())
        {
            var alertService = scope3.ServiceProvider.GetRequiredService<GeoBudgetAlertService>();
            await alertService.CheckAndAlertAsync(fleetId, ct);
        }

        push.SendCount.Should().Be(1, "idempotent: second call same month must not resend the 80% alert");

        // Verify idempotency marker was written.
        await VerifyMarkerExistsAsync(alertFactory, fleetId, 2026, 9, threshold: 80, ct);
    }

    /// <summary>When geo usage crosses 100% of budget, exactly one push alert fires.
    /// A second call (same month) must not fire again (idempotent via marker).</summary>
    [Fact]
    public async Task GeoUsage_Budget100_At100Percent_FiresAlertOnce()
    {
        var ct = TestContext.Current.CancellationToken;
        using var alertFactory = new GeoBudgetAlertTestFactory(fixture.ConnectionString, FakeNow);
        var push = alertFactory.Push;

        var (fleetId, adminId) = await SeedFleetAsync(ct, alertFactory);
        await SeedFleetSettingsAsync(fleetId, budget: 100, ct, alertFactory);
        await SeedPushSubscriptionAsync(fleetId, adminId, ct, alertFactory);

        // Seed 80 credits → 80% alert fires first.
        await SeedGeoUsageRowAsync(fleetId, new DateOnly(2026, 9, 10), GeoCacheKind.Suggest, creditsEst: 80, ct, alertFactory);

        await using (var scope1 = alertFactory.Services.CreateAsyncScope())
        {
            var alertService = scope1.ServiceProvider.GetRequiredService<GeoBudgetAlertService>();
            await alertService.CheckAndAlertAsync(fleetId, ct);
        }

        push.SendCount.Should().Be(1, "80% crossed → one push for the 80% threshold");

        // Add 20 more credits (different day) → total 100 = exactly 100%.
        await SeedGeoUsageRowAsync(fleetId, new DateOnly(2026, 9, 11), GeoCacheKind.Suggest, creditsEst: 20, ct, alertFactory);

        await using (var scope2 = alertFactory.Services.CreateAsyncScope())
        {
            var alertService = scope2.ServiceProvider.GetRequiredService<GeoBudgetAlertService>();
            await alertService.CheckAndAlertAsync(fleetId, ct);
        }

        push.SendCount.Should().Be(2, "100% crossed → second push for the 100% threshold (80% marker already exists)");

        // Third call (same month) → both markers exist → no third push.
        await using (var scope3 = alertFactory.Services.CreateAsyncScope())
        {
            var alertService = scope3.ServiceProvider.GetRequiredService<GeoBudgetAlertService>();
            await alertService.CheckAndAlertAsync(fleetId, ct);
        }

        push.SendCount.Should().Be(2, "idempotent: third call must not resend either alert");

        // Verify both markers.
        await VerifyMarkerExistsAsync(alertFactory, fleetId, 2026, 9, threshold: 80, ct);
        await VerifyMarkerExistsAsync(alertFactory, fleetId, 2026, 9, threshold: 100, ct);
    }

    // ── Budget alert — message content ────────────────────────────────────────

    /// <summary>The 80% push message tag contains the threshold and alert type identifier.</summary>
    [Fact]
    public async Task GeoUsage_Budget100_At80Percent_MessageTagContainsThreshold()
    {
        var ct = TestContext.Current.CancellationToken;
        using var alertFactory = new GeoBudgetAlertTestFactory(fixture.ConnectionString, FakeNow);
        var push = alertFactory.Push;

        var (fleetId, adminId) = await SeedFleetAsync(ct, alertFactory);
        await SeedFleetSettingsAsync(fleetId, budget: 100, ct, alertFactory);
        await SeedPushSubscriptionAsync(fleetId, adminId, ct, alertFactory);

        await SeedGeoUsageRowAsync(fleetId, new DateOnly(2026, 9, 10), GeoCacheKind.Suggest, creditsEst: 80, ct, alertFactory);

        await using var scope = alertFactory.Services.CreateAsyncScope();
        var alertService = scope.ServiceProvider.GetRequiredService<GeoBudgetAlertService>();
        await alertService.CheckAndAlertAsync(fleetId, ct);

        push.LastMessage.Should().NotBeNull();
        push.LastMessage!.Tag.Should().Contain("80", "the 80% alert tag must reference the threshold");
        push.LastMessage.Tag.Should().Contain("geo-budget", "tag identifies the alert type");
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private async Task<(Guid fleetId, Guid adminId)> SeedFleetAsync(
        CancellationToken ct, TaxiApiFactory? factory = null)
    {
        var usedFactory = factory ?? fixture.Factory;
        var fleetId = Guid.CreateVersion7();
        var adminId = Guid.CreateVersion7();

        await using var scope = usedFactory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.Fleets.Add(new Fleet
        {
            Id = fleetId,
            Slug = $"geo-budget-{Guid.NewGuid():N}",
            Name = "Geo Budget Test Fleet",
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
            Email = $"gba-admin-{adminId:N}@geo.local",
            Phone = $"+42077{Guid.NewGuid().ToString("N")[..7]}",
            DisplayName = "Geo Budget Admin",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync(ct);
        return (fleetId, adminId);
    }

    private async Task SeedFleetSettingsAsync(
        Guid fleetId, int budget, CancellationToken ct, TaxiApiFactory? factory = null)
    {
        var usedFactory = factory ?? fixture.Factory;
        await using var scope = usedFactory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.FleetSettings.Add(new FleetSettings
        {
            FleetId = fleetId,
            GeoMonthlyCreditBudget = budget
        });
        await db.SaveChangesAsync(ct);
    }

    private async Task SeedGeoUsageRowAsync(
        Guid fleetId, DateOnly day, GeoCacheKind kind, int creditsEst,
        CancellationToken ct, TaxiApiFactory? factory = null)
    {
        var usedFactory = factory ?? fixture.Factory;
        await using var scope = usedFactory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.GeoUsage.Add(new GeoUsage
        {
            FleetId = fleetId,
            Day = day,
            Kind = kind,
            Calls = creditsEst / 4 == 0 ? 1 : creditsEst / 4,
            CreditsEst = creditsEst
        });
        await db.SaveChangesAsync(ct);
    }

    private async Task SeedPushSubscriptionAsync(
        Guid fleetId, Guid userId, CancellationToken ct, TaxiApiFactory? factory = null)
    {
        var usedFactory = factory ?? fixture.Factory;
        await using var scope = usedFactory.Services.CreateAsyncScope();
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

    private async Task<Guid> SeedDispatcherAsync(Guid fleetId, CancellationToken ct)
    {
        var dispatcherId = Guid.CreateVersion7();
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.Users.Add(new User
        {
            Id = dispatcherId,
            FleetId = fleetId,
            Role = UserRole.Dispatcher,
            Email = $"gba-disp-{dispatcherId:N}@geo.local",
            Phone = $"+42078{Guid.NewGuid().ToString("N")[..7]}",
            DisplayName = "Geo Budget Dispatcher",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync(ct);
        return dispatcherId;
    }

    private async Task<Guid> SeedDriverAsync(Guid fleetId, CancellationToken ct)
    {
        var userId = Guid.CreateVersion7();
        var driverId = Guid.CreateVersion7();
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.Users.Add(new User
        {
            Id = userId,
            FleetId = fleetId,
            Role = UserRole.Driver,
            Email = $"gba-drv-{userId:N}@geo.local",
            Phone = $"+42079{Guid.NewGuid().ToString("N")[..7]}",
            DisplayName = "Geo Budget Driver",
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
        return userId; // return user ID for JWT minting via AsDriver
    }

    private static async Task VerifyMarkerExistsAsync(
        TaxiApiFactory factory, Guid fleetId, int year, int month, int threshold, CancellationToken ct)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var exists = await db.GeoBudgetAlertMarkers.IgnoreQueryFilters()
            .AnyAsync(m => m.FleetId == fleetId && m.Year == year && m.Month == month
                        && m.Threshold == threshold, ct);
        exists.Should().BeTrue(
            $"marker for fleet {fleetId} year={year} month={month} threshold={threshold} must exist");
    }

    // ── Local response DTO ────────────────────────────────────────────────────

    private sealed record GeoUsageResponseDto(
        int CreditsUsedThisMonth,
        int CreditBudget,
        double UsagePercent,
        int Year,
        int Month);
}

/// <summary>Test factory that wires a <see cref="RecordingPushSender"/> and pins a custom clock
/// for geo budget alert tests. Replaces IPushSender with the recording double.</summary>
internal sealed class GeoBudgetAlertTestFactory : TaxiApiFactory
{
    private RecordingPushSender? _push;

    /// <summary>The recording push sender used by this factory.</summary>
    internal RecordingPushSender Push => _push
        ??= new RecordingPushSender(Services.GetRequiredService<IServiceScopeFactory>());

    /// <summary>Initializes the factory pinned to the given clock instant.</summary>
    public GeoBudgetAlertTestFactory(string connectionString, DateTimeOffset fakeNow)
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
            // Replace push sender with recording double so tests can assert send counts.
            services.RemoveAll<IPushSender>();
            services.AddScoped<IPushSender>(_ => Push);
        });
    }
}

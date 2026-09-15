using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Time.Testing;
using Taxi.Api.Common.Geo;
using Taxi.Api.Common.Orders;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Infrastructure.Geo;
using Taxi.Api.Realtime;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Geo;

/// <summary>Unit-level tests for <see cref="OrderSubscriptionTracker"/> and
/// <see cref="PickupEtaService"/> that validate AC#3:
/// <list type="bullet">
///   <item>OrderSubscriptionTracker: Add increments, RemoveConnection decrements all, HasViewers reflects count.</item>
///   <item>Accept → exactly 1 IGeoService.RouteAsync call (FakeGeoService.RouteCallCount == 1).</item>
///   <item>5-minute watch with 60 s throttle → ≤ 5 route calls.</item>
///   <item>No subscriber → 0 route calls, ETA still extrapolated.</item>
/// </list>
/// <para>These tests are self-contained (no Postgres / HttpClient required) — they construct services
/// directly, using <see cref="FakeGeoService"/> + <see cref="FakeTimeProvider"/> for determinism.</para>
/// </summary>
[Collection(TestCollections.Database)]
public sealed class PickupEtaTests(PostgresFixture fixture)
{
    // ── Fake hub context ──────────────────────────────────────────────────────

    /// <summary>A stub hub context that ignores all SendAsync calls.
    /// We only care about how many RouteAsync calls the service makes.</summary>
    private sealed class NoOpHubContext : IHubContext<FleetHub>
    {
        public IHubClients Clients => new NoOpHubClients();
        public IGroupManager Groups => null!;

        private sealed class NoOpHubClients : IHubClients
        {
            public IClientProxy All => new NoOpProxy();
            public IClientProxy AllExcept(IReadOnlyList<string> excludedConnectionIds) => new NoOpProxy();
            public IClientProxy Client(string connectionId) => new NoOpProxy();
            public IClientProxy Clients(IReadOnlyList<string> connectionIds) => new NoOpProxy();
            public IClientProxy Group(string groupName) => new NoOpProxy();
            public IClientProxy GroupExcept(string groupName, IReadOnlyList<string> excludedConnectionIds) => new NoOpProxy();
            public IClientProxy Groups(IReadOnlyList<string> groupNames) => new NoOpProxy();
            public IClientProxy User(string userId) => new NoOpProxy();
            public IClientProxy Users(IReadOnlyList<string> userIds) => new NoOpProxy();
        }

        private sealed class NoOpProxy : IClientProxy
        {
            public Task SendCoreAsync(string method, object?[] args, CancellationToken cancellationToken = default)
                => Task.CompletedTask;
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /// <summary>Builds a <see cref="PickupEtaService"/> backed by a scope factory that resolves
    /// the supplied <paramref name="fakeGeo"/> as a singleton-instance <see cref="IGeoService"/>.
    /// Registering the fake as a singleton instance means <see cref="FakeGeoService.RouteCallCount"/>
    /// accumulates across the per-call scopes, keeping the throttle assertions valid.</summary>
    private static PickupEtaService BuildService(FakeGeoService fakeGeo, OrderSubscriptionTracker tracker, FakeTimeProvider clock)
    {
        var services = new ServiceCollection();
        // Register the fake as a singleton instance — same object across all per-call scopes so
        // RouteCallCount accumulates correctly across the per-call scopes.
        services.AddSingleton<IGeoService>(fakeGeo);
        var scopeFactory = services.BuildServiceProvider().GetRequiredService<IServiceScopeFactory>();
        return new(scopeFactory, tracker, new NoOpHubContext(), clock, NullLogger<PickupEtaService>.Instance);
    }

    private const double DriverLat = 50.0;
    private const double DriverLng = 14.4;
    private const double PickupLat = 50.08;
    private const double PickupLng = 14.42;
    private static readonly Guid FleetId = Guid.NewGuid();

    // ── OrderSubscriptionTracker tests ────────────────────────────────────────

    /// <summary>Add increments the viewer count; HasViewers returns true; ViewerCount returns the count.</summary>
    [Fact]
    public void Add_SingleConnection_IncrementsViewerCount()
    {
        var tracker = new OrderSubscriptionTracker();
        var orderId = Guid.NewGuid();

        tracker.Add("conn-1", orderId);

        tracker.ViewerCount(orderId).Should().Be(1);
        tracker.HasViewers(orderId).Should().BeTrue();
    }

    /// <summary>Two different connections subscribing to the same order → count = 2.</summary>
    [Fact]
    public void Add_TwoConnections_SameOrder_CountIsTwo()
    {
        var tracker = new OrderSubscriptionTracker();
        var orderId = Guid.NewGuid();

        tracker.Add("conn-1", orderId);
        tracker.Add("conn-2", orderId);

        tracker.ViewerCount(orderId).Should().Be(2);
    }

    /// <summary>Adding the same connection twice for the same order is idempotent (count stays 1).</summary>
    [Fact]
    public void Add_SameConnectionTwice_IdempotentCount()
    {
        var tracker = new OrderSubscriptionTracker();
        var orderId = Guid.NewGuid();

        tracker.Add("conn-1", orderId);
        tracker.Add("conn-1", orderId);

        tracker.ViewerCount(orderId).Should().Be(1);
    }

    /// <summary>RemoveConnection decrements the viewer count for all orders that connection subscribed to.</summary>
    [Fact]
    public void RemoveConnection_DecrementsAllSubscribedOrders()
    {
        var tracker = new OrderSubscriptionTracker();
        var order1 = Guid.NewGuid();
        var order2 = Guid.NewGuid();

        tracker.Add("conn-1", order1);
        tracker.Add("conn-1", order2);
        tracker.Add("conn-2", order1);

        tracker.RemoveConnection("conn-1");

        tracker.ViewerCount(order1).Should().Be(1, "conn-2 is still subscribed to order1");
        tracker.ViewerCount(order2).Should().Be(0, "only conn-1 was subscribed to order2");
        tracker.HasViewers(order2).Should().BeFalse();
    }

    /// <summary>RemoveConnection on unknown connection is a no-op (no exception).</summary>
    [Fact]
    public void RemoveConnection_UnknownConnection_IsNoOp()
    {
        var tracker = new OrderSubscriptionTracker();

        var act = () => tracker.RemoveConnection("unknown-conn");
        act.Should().NotThrow();
    }

    /// <summary>Reset clears all viewer counts and connection mappings.</summary>
    [Fact]
    public void Reset_ClearsAllState()
    {
        var tracker = new OrderSubscriptionTracker();
        var orderId = Guid.NewGuid();
        tracker.Add("conn-1", orderId);

        tracker.Reset();

        tracker.ViewerCount(orderId).Should().Be(0);
        tracker.HasViewers(orderId).Should().BeFalse();
    }

    // ── PickupEtaService tests ────────────────────────────────────────────────

    /// <summary>Accept path: BroadcastAcceptEtaAsync makes exactly 1 RouteAsync call.</summary>
    [Fact]
    public async Task Accept_ComputesPickupEta_ExactlyOneRouteCall()
    {
        var ct = TestContext.Current.CancellationToken;
        var fakeGeo = new FakeGeoService();
        fakeGeo.Reset();
        fakeGeo.RouteResult = new MapyRouteResultData(800, 100, []);

        var clock = new FakeTimeProvider(new DateTimeOffset(2026, 9, 10, 12, 0, 0, TimeSpan.Zero));
        var tracker = new OrderSubscriptionTracker();
        var service = BuildService(fakeGeo, tracker, clock);

        await service.BroadcastAcceptEtaAsync(
            Guid.NewGuid(), FleetId, DriverLat, DriverLng, PickupLat, PickupLng, ct);

        fakeGeo.RouteCallCount.Should().Be(1, "accept-time should make exactly one route call");
    }

    /// <summary>5-minute watch with 60s throttle → at most 5 further route calls.</summary>
    [Fact]
    public async Task TrackingWatched5Minutes_AtMostFiveRefreshCalls()
    {
        var ct = TestContext.Current.CancellationToken;
        var fakeGeo = new FakeGeoService();
        fakeGeo.Reset();
        fakeGeo.RouteResult = new MapyRouteResultData(500, 60, []);

        var clock = new FakeTimeProvider(new DateTimeOffset(2026, 9, 10, 12, 0, 0, TimeSpan.Zero));
        var tracker = new OrderSubscriptionTracker();
        var orderId = Guid.NewGuid();

        // Simulate one active viewer.
        tracker.Add("conn-viewer", orderId);

        var service = BuildService(fakeGeo, tracker, clock);

        // Simulate 5 minutes of position updates arriving every 30 s — total 10 ticks.
        // With 60 s throttle and one viewer, only ticks where >= 60 s has elapsed should call RouteAsync.
        // First call at t=0 (BroadcastAcceptEtaAsync seeds the lastRefresh), then ticks at 30s, 60s, 90s,...300s.
        // Ticks at 60s, 120s, 180s, 240s, 300s qualify → 5 route calls from RefreshEtaAsync.
        await service.BroadcastAcceptEtaAsync(orderId, FleetId, DriverLat, DriverLng, PickupLat, PickupLng, ct);
        var callsAfterAccept = fakeGeo.RouteCallCount;

        for (var i = 1; i <= 10; i++)
        {
            clock.Advance(TimeSpan.FromSeconds(30));
            await service.RefreshEtaAsync(orderId, FleetId, DriverLat, DriverLng, PickupLat, PickupLng, speedKmh: 40, ct);
        }

        var refreshCalls = fakeGeo.RouteCallCount - callsAfterAccept;
        refreshCalls.Should().BeLessOrEqualTo(5,
            "5-minute watch with 60s throttle should make at most 5 route calls");
        refreshCalls.Should().BeGreaterThan(0,
            "at least some refresh calls should have happened when viewer is present");
    }

    /// <summary>No subscriber → RefreshEtaAsync makes 0 route calls; ETA still extrapolated and broadcast.</summary>
    [Fact]
    public async Task NoSubscriber_ZeroRefreshCalls_ExtrapolatesEta()
    {
        var ct = TestContext.Current.CancellationToken;
        var fakeGeo = new FakeGeoService();
        fakeGeo.Reset();
        fakeGeo.RouteResult = new MapyRouteResultData(500, 60, []);

        var clock = new FakeTimeProvider(new DateTimeOffset(2026, 9, 10, 12, 0, 0, TimeSpan.Zero));
        var tracker = new OrderSubscriptionTracker();
        // No viewers added.
        var orderId = Guid.NewGuid();
        var service = BuildService(fakeGeo, tracker, clock);

        // Advance 5 minutes worth of position ticks.
        for (var i = 0; i < 10; i++)
        {
            clock.Advance(TimeSpan.FromSeconds(30));
            await service.RefreshEtaAsync(orderId, FleetId, DriverLat, DriverLng, PickupLat, PickupLng, speedKmh: 40, ct);
        }

        fakeGeo.RouteCallCount.Should().Be(0,
            "with no viewer, no IGeoService route calls should be made");
    }

    /// <summary>OrderSubscriptionTracker is registered as a singleton in DI and is the same instance
    /// as the one injected into FleetHub and PickupEtaService.</summary>
    [Fact]
    public void OrderSubscriptionTracker_IsRegisteredAsSingleton()
    {
        using var scope1 = fixture.Factory.Services.CreateScope();
        using var scope2 = fixture.Factory.Services.CreateScope();

        var tracker1 = scope1.ServiceProvider.GetRequiredService<OrderSubscriptionTracker>();
        var tracker2 = scope2.ServiceProvider.GetRequiredService<OrderSubscriptionTracker>();

        tracker1.Should().BeSameAs(tracker2, "singleton must be the same instance across scopes");
    }

    // ── Integration tests (through HTTP) ─────────────────────────────────────

    /// <summary>The dispatcher assign-picker (GET /drivers) returns driver lat/lng without calling
    /// RouteAsync — distances from order pickup to driver are computed client-side using haversine.
    /// AC#5 of WI-11: opening the picker triggers zero route calls.</summary>
    [Fact]
    public async Task AssignPicker_UsesHaversine_ZeroRouteCalls()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];

        // Seed a fleet with one dispatcher and one driver.
        using var seedScope = fixture.Factory.Services.CreateScope();
        var seedDb = seedScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var fleet = new Fleet
        {
            Id = Guid.CreateVersion7(),
            Slug = $"eta-{suffix}",
            Name = $"ETA Test Fleet {suffix}",
            Phone = "+420600000099",
            Currency = "CZK",
            TimeZone = "Europe/Prague",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        };
        var dispatcherUser = new User
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            Role = UserRole.Dispatcher,
            Phone = $"+42060099{suffix[..4]}",
            DisplayName = "ETA Dispatcher",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        };
        var driverUser = new User
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            Role = UserRole.Driver,
            Phone = $"+42080099{suffix[..4]}",
            DisplayName = "ETA Driver",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        };
        var driver = new Driver
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            UserId = driverUser.Id,
            Status = DriverStatus.Free,
            IsActive = true,
            LastLat = 50.08,
            LastLng = 14.42,
            LastPositionAt = DateTimeOffset.UtcNow
        };
        seedDb.Fleets.Add(fleet);
        seedDb.Users.Add(dispatcherUser);
        seedDb.Users.Add(driverUser);
        seedDb.Drivers.Add(driver);
        await seedDb.SaveChangesAsync(ct);

        // Reset the geo fake so RouteCallCount starts from 0.
        var fakeGeo = fixture.Factory.Services.GetRequiredService<FakeGeoService>();
        fakeGeo.Reset();

        // Call GET /api/v1/drivers (the assign-picker endpoint).
        var client = fixture.Factory.CreateClient();
        client.AsDispatcher(fleet.Id, dispatcherUser.Id);
        var resp = await client.GetAsync("api/v1/drivers", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK, "dispatcher should see the driver list");

        fakeGeo.RouteCallCount.Should().Be(0,
            "the assign-picker uses haversine only — GET /drivers must not call RouteAsync");

        fakeGeo.Reset();
    }

    // ── DI lifetime regression guard ──────────────────────────────────────────

    /// <summary>Regression guard: PickupEtaService (singleton) must NOT directly consume IGeoService
    /// (scoped). If it does, .NET's DI ValidateOnBuild throws "Cannot consume scoped service from
    /// singleton". This test reproduces the production lifetime (IGeoService = scoped) so the
    /// captive-dependency bug is detected even though <see cref="TaxiApiFactory"/> overrides
    /// IGeoService to singleton (which masks the error in factory-based tests).</summary>
    [Fact]
    public void PickupEtaService_WithScopedIGeoService_DIValidationDoesNotThrow()
    {
        var services = new ServiceCollection();

        // Register IGeoService as SCOPED — matching the production registration in GeoFeatureConfiguration.
        // A singleton PickupEtaService that injects this directly would fail ValidateOnBuild.
        services.AddScoped<IGeoService>(_ => new FakeGeoService());

        // Other PickupEtaService dependencies (all singletons — no captive dep issue).
        services.AddSingleton<OrderSubscriptionTracker>();
        services.AddSingleton<IHubContext<FleetHub>>(_ => new NoOpHubContext());
        services.AddSingleton<TimeProvider>(_ =>
            new FakeTimeProvider(new DateTimeOffset(2026, 9, 10, 12, 0, 0, TimeSpan.Zero)));
        services.AddLogging();

        // PickupEtaService is registered as singleton — it must not capture IGeoService directly.
        services.AddSingleton<PickupEtaService>();

        // ValidateOnBuild + ValidateScopes detects the captive-dependency at build time.
        var act = () => services.BuildServiceProvider(
            new ServiceProviderOptions { ValidateScopes = true, ValidateOnBuild = true });

        act.Should().NotThrow(
            "PickupEtaService (singleton) must resolve its IGeoService dependency " +
            "via IServiceScopeFactory per-call, not from the singleton constructor");
    }

    /// <summary>POST /orders/{id}/accept makes exactly one RouteAsync call when the driver has a
    /// last known position. AC#3 (second clause): assigning + accepting → at most one more route
    /// call beyond create. This test goes through the real HTTP endpoint so the wiring between
    /// AcceptOrderEndpoint and PickupEtaService is exercised end-to-end.</summary>
    [Fact]
    public async Task AcceptEndpoint_DriverWithPosition_ExactlyOneRouteCall()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];

        // ── Seed fleet, dispatcher, driver, vehicle ────────────────────────────
        using var seedScope = fixture.Factory.Services.CreateScope();
        var seedDb = seedScope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        var fleet = new Fleet
        {
            Id = Guid.CreateVersion7(),
            Slug = $"acc-{suffix}",
            Name = $"Accept ETA Fleet {suffix}",
            Phone = "+420600000088",
            Currency = "CZK",
            TimeZone = "Europe/Prague",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        };
        var dispatcherUser = new User
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            Role = UserRole.Dispatcher,
            Phone = $"+42060088{suffix[..4]}",
            DisplayName = "Accept Dispatcher",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        };
        var driverUser = new User
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            Role = UserRole.Driver,
            Phone = $"+42080088{suffix[..4]}",
            DisplayName = "Accept Driver",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        };
        var vehicle = new Vehicle
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            Plate = $"AC{suffix[..4].ToUpperInvariant()}",
            Make = "Skoda",
            Model = "Octavia",
            Color = "White",
            Seats = 4,
            IsActive = true
        };
        var driver = new Driver
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            UserId = driverUser.Id,
            Status = DriverStatus.Free,
            CurrentVehicleId = vehicle.Id,
            IsActive = true,
            // Driver has a last known position so AcceptOrderEndpoint will call BroadcastAcceptEtaAsync.
            LastLat = 50.0,
            LastLng = 14.4,
            LastPositionAt = DateTimeOffset.UtcNow
        };
        seedDb.Fleets.Add(fleet);
        seedDb.Users.Add(dispatcherUser);
        seedDb.Users.Add(driverUser);
        seedDb.Vehicles.Add(vehicle);
        seedDb.Drivers.Add(driver);
        await seedDb.SaveChangesAsync(ct);

        // ── Configure fake geo ──────────────────────────────────────────────────
        var fakeGeo = fixture.Factory.Services.GetRequiredService<FakeGeoService>();
        fakeGeo.Reset();
        fakeGeo.RouteResult = new MapyRouteResultData(900, 120, []);

        // ── Create order via dispatcher ─────────────────────────────────────────
        // Use a deterministic numeric phone derived from the fleet Id (avoid hex chars from Guid).
        var phoneDigits = Math.Abs(fleet.Id.GetHashCode()) % 100_000_000;

        var dispClient = fixture.Factory.CreateClient();
        dispClient.AsDispatcher(fleet.Id, dispatcherUser.Id);
        var createResp = await dispClient.PostAsJsonAsync("api/v1/orders", new
        {
            pickupAddress = "Václavské náměstí 1",
            pickupLat = 50.0808,
            pickupLng = 14.4282,
            dropoffAddress = "Náměstí Míru 1",
            dropoffLat = 50.0751,
            dropoffLng = 14.4379,
            customerPhone = $"+420{phoneDigits:D9}",
            customerName = "ETA Customer",
            passengers = 1,
            priceType = "Estimate",
            estimatedPriceCzk = 250
        }, ct);
        createResp.StatusCode.Should().Be(HttpStatusCode.Created);
        var createBody = await createResp.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>(ct);
        var orderId = Guid.Parse(createBody.GetProperty("order").GetProperty("id").GetString()!);

        // Route may have been called during create (WI-10 quote-once) — save current count.
        var callsAfterCreate = fakeGeo.RouteCallCount;

        // ── Assign order via OrderService ───────────────────────────────────────
        using var assignScope = fixture.Factory.Services.CreateScope();
        var assignTenant = assignScope.ServiceProvider.GetRequiredService<CurrentTenant>();
        assignTenant.FleetId = fleet.Id;
        var assignSvc = assignScope.ServiceProvider.GetRequiredService<OrderService>();
        var assignResult = await assignSvc.TransitionAsync(
            orderId,
            OrderTransition.Assign,
            new Actor(dispatcherUser.Id, UserRole.Dispatcher),
            new AssignPayload(driver.Id, vehicle.Id),
            ct);
        assignResult.IsSuccess.Should().BeTrue("assign should succeed");

        // Assign should NOT call RouteAsync.
        fakeGeo.RouteCallCount.Should().Be(callsAfterCreate, "assign must not call RouteAsync");

        // ── Accept via HTTP endpoint ────────────────────────────────────────────
        var driverClient = fixture.Factory.CreateClient();
        driverClient.AsDriver(fleet.Id, driverUser.Id);
        var acceptResp = await driverClient.PostAsJsonAsync($"api/v1/orders/{orderId}/accept", new { }, ct);
        acceptResp.StatusCode.Should().Be(HttpStatusCode.OK, "driver should be able to accept the assigned order");

        // Accept must make exactly ONE route call (the initial driver→pickup ETA).
        var callsAfterAccept = fakeGeo.RouteCallCount;
        (callsAfterAccept - callsAfterCreate).Should().Be(1,
            "AcceptOrderEndpoint must call RouteAsync exactly once for the initial pickup ETA");

        fakeGeo.Reset();
    }
}

using FluentAssertions;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Time.Testing;
using Taxi.Api.Common.Orders;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Realtime;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Orders.StateMachine;

/// <summary>Integration tests for <see cref="OrderService"/>.
/// Uses a real Postgres container via the shared <see cref="PostgresFixture"/>.</summary>
[Collection(TestCollections.Database)]
public sealed class OrderServiceTests(PostgresFixture fixture)
{
    private static readonly DateTimeOffset FixedNow = new(2026, 9, 10, 12, 0, 0, TimeSpan.Zero);

    // ── Seed helpers ──────────────────────────────────────────────────────────

    /// <summary>Seeds a fleet, a dispatcher user, a vehicle, and a driver. Returns all four IDs.</summary>
    private static async Task<(Fleet fleet, Driver driver, Guid driverUserId, Guid dispatcherUserId)>
        SeedFleetAndDriver(TaxiDbContext db, CancellationToken ct = default)
    {
        var suffix = Guid.NewGuid().ToString("N");

        var fleet = new Fleet
        {
            Id = Guid.CreateVersion7(),
            Slug = $"svc-{suffix}",
            Name = "Service Test Fleet",
            Phone = "+420600999001",
            Currency = "CZK",
            TimeZone = "Europe/Prague",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        };

        db.Fleets.Add(fleet);
        await db.SaveChangesAsync(ct);

        var vehicle = new Vehicle
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            Plate = $"SVC{suffix[..4].ToUpperInvariant()}",
            Make = "Skoda",
            Model = "Octavia",
            Color = "Silver",
            Seats = 4,
            IsActive = true
        };
        var dispatcherUser = new User
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            Role = UserRole.Dispatcher,
            Phone = $"+4206009{suffix[..9]}",
            DisplayName = "Test Dispatcher",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        };
        var driverUser = new User
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            Role = UserRole.Driver,
            Phone = $"+4206008{suffix[..9]}",
            DisplayName = "Test Driver",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        };
        var driver = new Driver
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            UserId = driverUser.Id,
            Status = DriverStatus.Free,
            CurrentVehicleId = vehicle.Id,
            IsActive = true
        };

        db.Users.Add(dispatcherUser);
        db.Users.Add(driverUser);
        db.Vehicles.Add(vehicle);
        db.Drivers.Add(driver);
        await db.SaveChangesAsync(ct);

        return (fleet, driver, driverUser.Id, dispatcherUser.Id);
    }

    private static Order BuildOrder(Guid fleetId, OrderStatus status = OrderStatus.New) => new()
    {
        Id = Guid.CreateVersion7(),
        FleetId = fleetId,
        PublicCode = $"S{Guid.NewGuid():N}"[..6].ToUpperInvariant(),
        Status = status,
        CustomerPhone = "+420600000099",
        PickupAddress = "Test Pickup St",
        Source = OrderSource.Dispatcher,
        PriceType = PriceType.Estimate,
        CreatedAt = DateTimeOffset.UtcNow,
        UpdatedAt = DateTimeOffset.UtcNow,
        Version = 1
    };

    private static OrderService CreateOrderService(
        TaxiDbContext db,
        IRealtimePublisher? publisher = null,
        DateTimeOffset? pinnedNow = null)
    {
        var fakeTime = new FakeTimeProvider(pinnedNow ?? FixedNow);
        var pub = publisher ?? new RecordingRealtimePublisher();
        return new OrderService(db, fakeTime, pub);
    }

    // ── Test 1: Happy path persists order and event atomically ────────────────

    /// <summary>Verifies that a successful transition persists order state and the OrderEvent in one
    /// transaction, and increments Version.</summary>
    [Fact]
    public async Task OrderService_Transition_PersistsOrderAndEventAtomically()
    {
        var ct = TestContext.Current.CancellationToken;

        using var scope = fixture.Factory.Services.CreateScope();
        var tenant = scope.ServiceProvider.GetRequiredService<CurrentTenant>();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        var (fleet, driver, _, dispatcherUserId) = await SeedFleetAndDriver(db, ct);
        tenant.FleetId = fleet.Id;

        var order = BuildOrder(fleet.Id);
        db.Orders.Add(order);
        await db.SaveChangesAsync(ct);

        var svc = CreateOrderService(db);
        var result = await svc.TransitionAsync(
            order.Id,
            OrderTransition.Assign,
            new Actor(dispatcherUserId, UserRole.Dispatcher),
            new AssignPayload(driver.Id, driver.CurrentVehicleId!.Value),
            ct);

        result.IsSuccess.Should().BeTrue();

        // Verify order is persisted in DB.
        var dbOrder = await db.Orders.AsNoTracking().FirstAsync(o => o.Id == order.Id, ct);
        dbOrder.Status.Should().Be(OrderStatus.Assigned);
        dbOrder.DriverId.Should().Be(driver.Id);
        dbOrder.Version.Should().Be(2, "OrderService increments Version once");

        // Verify event is persisted in DB.
        var events = await db.OrderEvents.AsNoTracking()
            .Where(e => e.OrderId == order.Id)
            .ToListAsync(ct);
        events.Should().HaveCount(1);
        events[0].Type.Should().Be(OrderEventType.Assigned);
    }

    // ── Test 2: Failing save does not publish ─────────────────────────────────

    /// <summary>Verifies that when save fails (StaleVersion), no events are published — broadcast
    /// never happens before commit.</summary>
    [Fact]
    public async Task OrderService_FailingSave_NoPublish()
    {
        var ct = TestContext.Current.CancellationToken;
        var recording = new RecordingRealtimePublisher();

        using var scope = fixture.Factory.Services.CreateScope();
        var tenant = scope.ServiceProvider.GetRequiredService<CurrentTenant>();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        var (fleet, driver, _, dispatcherUserId) = await SeedFleetAndDriver(db, ct);
        tenant.FleetId = fleet.Id;

        // Force a save failure by bumping Version out-of-band (concurrency conflict).
        var order = BuildOrder(fleet.Id);
        db.Orders.Add(order);
        await db.SaveChangesAsync(ct);

        // Bump version from a second scope to simulate concurrent write.
        using var bump = fixture.Factory.Services.CreateScope();
        var bumpTenant = bump.ServiceProvider.GetRequiredService<CurrentTenant>();
        bumpTenant.FleetId = fleet.Id;
        var bumpDb = bump.ServiceProvider.GetRequiredService<TaxiDbContext>();
        await bumpDb.Orders
            .Where(o => o.Id == order.Id)
            .ExecuteUpdateAsync(s => s.SetProperty(o => o.Version, 999), ct);

        var svc = new OrderService(db, new FakeTimeProvider(FixedNow), recording);
        var result = await svc.TransitionAsync(
            order.Id,
            OrderTransition.Assign,
            new Actor(dispatcherUserId, UserRole.Dispatcher),
            new AssignPayload(driver.Id, driver.CurrentVehicleId!.Value),
            ct);

        result.IsSuccess.Should().BeFalse();
        result.FailureKind.Should().Be(TransitionFailureKind.StaleVersion);
        recording.OrderChangedCalls.Should().BeEmpty("no publish on failed save");
    }

    // ── Test 3: Concurrency conflict returns StaleVersion ─────────────────────

    /// <summary>Verifies that when two service instances load the same order and both try to save,
    /// the second one returns StaleVersion (not an exception). We simulate this by loading
    /// the order in scope2 before scope1 commits, then running both saves.</summary>
    [Fact]
    public async Task OrderService_ConcurrencyConflict_ReturnsStaleVersion()
    {
        var ct = TestContext.Current.CancellationToken;

        using var scope1 = fixture.Factory.Services.CreateScope();
        var t1 = scope1.ServiceProvider.GetRequiredService<CurrentTenant>();
        var db1 = scope1.ServiceProvider.GetRequiredService<TaxiDbContext>();

        using var scope2 = fixture.Factory.Services.CreateScope();
        var t2 = scope2.ServiceProvider.GetRequiredService<CurrentTenant>();
        var db2 = scope2.ServiceProvider.GetRequiredService<TaxiDbContext>();

        var (fleet, driver, _, dispatcherUserId) = await SeedFleetAndDriver(db1, ct);
        t1.FleetId = fleet.Id;
        t2.FleetId = fleet.Id;

        var order = BuildOrder(fleet.Id);
        db1.Orders.Add(order);
        await db1.SaveChangesAsync(ct);

        // Pre-load the order into scope2's context (version = 1) BEFORE scope1 transitions.
        var preLoadedOrder = await db2.Orders.FirstAsync(o => o.Id == order.Id, ct);
        preLoadedOrder.Should().NotBeNull("order must be pre-loaded so scope2 has version=1");

        // scope1 transitions and saves (version becomes 2).
        var svc1 = CreateOrderService(db1);
        var result1 = await svc1.TransitionAsync(
            order.Id,
            OrderTransition.Assign,
            new Actor(dispatcherUserId, UserRole.Dispatcher),
            new AssignPayload(driver.Id, driver.CurrentVehicleId!.Value),
            ct);
        result1.IsSuccess.Should().BeTrue("first transition should succeed");

        // scope2 now calls TransitionAsync — its db2 still tracks the pre-loaded entity at version=1,
        // but OrderService loads the order fresh via FirstOrDefaultAsync. Since db2 is tracking version=1,
        // we bump the DB version out-of-band to simulate a second conflicting transaction by bumping
        // the order entity already loaded in db2, then have it try to save.
        // Use the simpler approach: scope2 assigns to the same order; since db2 loaded version=1,
        // the concurrency token mismatch will fire on save (db now has version=2 from scope1).
        // OrderService's FirstOrDefaultAsync will return the tracked entity in db2 (version=1).
        var svc2 = CreateOrderService(db2);
        var result2 = await svc2.TransitionAsync(
            order.Id,
            OrderTransition.Assign,
            new Actor(dispatcherUserId, UserRole.Dispatcher),
            new AssignPayload(driver.Id, driver.CurrentVehicleId!.Value),
            ct);

        result2.IsSuccess.Should().BeFalse();
        result2.FailureKind.Should().Be(TransitionFailureKind.StaleVersion);
    }

    // ── Test 4: Publishes after successful commit ─────────────────────────────

    /// <summary>Verifies that OrderChanged is published after a successful commit.</summary>
    [Fact]
    public async Task OrderService_SuccessfulTransition_PublishesAfterCommit()
    {
        var ct = TestContext.Current.CancellationToken;
        var recording = new RecordingRealtimePublisher();

        using var scope = fixture.Factory.Services.CreateScope();
        var tenant = scope.ServiceProvider.GetRequiredService<CurrentTenant>();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        var (fleet, driver, _, dispatcherUserId) = await SeedFleetAndDriver(db, ct);
        tenant.FleetId = fleet.Id;

        var order = BuildOrder(fleet.Id);
        db.Orders.Add(order);
        await db.SaveChangesAsync(ct);

        var svc = new OrderService(db, new FakeTimeProvider(FixedNow), recording);
        var result = await svc.TransitionAsync(
            order.Id,
            OrderTransition.Assign,
            new Actor(dispatcherUserId, UserRole.Dispatcher),
            new AssignPayload(driver.Id, driver.CurrentVehicleId!.Value),
            ct);

        result.IsSuccess.Should().BeTrue();
        recording.OrderChangedCalls.Should().HaveCount(1, "exactly one OrderChanged published");
        recording.OrderChangedCalls[0].Id.Should().Be(order.Id);
    }

    // ── Test 5: Reassign releases old driver to Free ──────────────────────────

    /// <summary>Verifies that Reassign transitions the old driver to Free in the DB,
    /// new driver is set, and DriverStatusChanged is published.</summary>
    [Fact]
    public async Task OrderService_Reassign_ReleasesOldDriverToFree()
    {
        var ct = TestContext.Current.CancellationToken;
        var recording = new RecordingRealtimePublisher();

        using var scope = fixture.Factory.Services.CreateScope();
        var tenant = scope.ServiceProvider.GetRequiredService<CurrentTenant>();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        var (fleet, driver1, _, dispatcherUserId) = await SeedFleetAndDriver(db, ct);
        tenant.FleetId = fleet.Id;

        // Create a second driver.
        var suffix2 = Guid.NewGuid().ToString("N");
        var driver2User = new User
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            Role = UserRole.Driver,
            Phone = $"+4206007{suffix2[..9]}",
            DisplayName = "Driver 2",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        };
        var driver2 = new Driver
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            UserId = driver2User.Id,
            Status = DriverStatus.Free,
            CurrentVehicleId = driver1.CurrentVehicleId,
            IsActive = true
        };
        db.Users.Add(driver2User);
        db.Drivers.Add(driver2);
        await db.SaveChangesAsync(ct);

        // Create order already assigned to driver1.
        var order = BuildOrder(fleet.Id);
        order.DriverId = driver1.Id;
        order.Status = OrderStatus.Assigned;
        order.AssignedAt = FixedNow.AddMinutes(-2);
        db.Orders.Add(order);
        await db.SaveChangesAsync(ct);

        var svc = new OrderService(db, new FakeTimeProvider(FixedNow), recording);
        var result = await svc.TransitionAsync(
            order.Id,
            OrderTransition.Reassign,
            new Actor(dispatcherUserId, UserRole.Dispatcher),
            new AssignPayload(driver2.Id, driver2.CurrentVehicleId!.Value),
            ct);

        result.IsSuccess.Should().BeTrue();

        // Verify driver1 is Free in DB.
        var updatedDriver1 = await db.Drivers.AsNoTracking().FirstAsync(d => d.Id == driver1.Id, ct);
        updatedDriver1.Status.Should().Be(DriverStatus.Free);

        // Verify order now points to driver2.
        var updatedOrder = await db.Orders.AsNoTracking().FirstAsync(o => o.Id == order.Id, ct);
        updatedOrder.DriverId.Should().Be(driver2.Id);

        // Verify DriverStatusChanged was published for old driver.
        recording.DriverStatusChangedCalls.Should().ContainSingle(
            c => c.DriverId == driver1.Id && c.Status == DriverStatus.Free);
    }
}

using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Infrastructure.Jobs;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Jobs;

/// <summary>Integration tests for <see cref="AutoDispatchJob"/>.
/// Tests drive the job tick logic directly via <c>RunTickAsync</c> — deterministic, no timer waits.
/// <para><b>Timer testability pattern:</b> each job exposes an internal <c>RunTickAsync(CancellationToken)</c>
/// method that contains all per-tick business logic. Tests construct job instances manually and call
/// <c>RunTickAsync</c> directly — deterministic, no PeriodicTimer waits.</para>
/// </summary>
[Collection(TestCollections.Database)]
public sealed class AutoDispatchJobTests(PostgresFixture fixture)
{
    private static readonly DateTimeOffset FixedNow = new(2026, 9, 10, 12, 0, 0, TimeSpan.Zero);

    // ── Seed helpers ──────────────────────────────────────────────────────────

    /// <summary>Seeds a fleet and its settings, a dispatcher user, a vehicle, and a driver.
    /// Returns the seeded entities. The driver is <c>Free</c> with position set near pickup by default;
    /// caller must set <c>LastLat</c>/<c>LastLng</c>/<c>LastPositionAt</c> when needed.</summary>
    private static async Task<(Fleet fleet, Driver driver, Guid driverUserId, Guid dispatcherUserId)>
        SeedFleetAndDriver(TaxiDbContext db, CancellationToken ct = default)
    {
        var suffix = Guid.NewGuid().ToString("N");

        var fleet = new Fleet
        {
            Id = Guid.CreateVersion7(),
            Slug = $"ad-{suffix[..8]}",
            Name = "AutoDispatch Test Fleet",
            Phone = "+420600100001",
            Currency = "CZK",
            TimeZone = "Europe/Prague",
            IsActive = true,
            CreatedAt = FixedNow
        };

        db.Fleets.Add(fleet);
        await db.SaveChangesAsync(ct);

        var vehicle = new Vehicle
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            Plate = $"AD{suffix[..4].ToUpperInvariant()}",
            Make = "Skoda",
            Model = "Octavia",
            Color = "Blue",
            Seats = 4,
            IsActive = true
        };
        var dispatcherUser = new User
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            Role = UserRole.Dispatcher,
            Phone = $"+4206001{suffix[..9]}",
            DisplayName = "AutoDispatch Dispatcher",
            IsActive = true,
            CreatedAt = FixedNow
        };
        var driverUser = new User
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            Role = UserRole.Driver,
            Phone = $"+4206002{suffix[..9]}",
            DisplayName = "AutoDispatch Driver",
            IsActive = true,
            CreatedAt = FixedNow
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

    /// <summary>Seeds <see cref="FleetSettings"/> with <c>AutoDispatchEnabled=true</c>
    /// and the given parameters. AutoDispatchAfterSeconds defaults to 60.</summary>
    private static async Task SeedAutoDispatchSettings(
        TaxiDbContext db,
        Guid fleetId,
        bool enabled = true,
        int afterSeconds = 60,
        int maxRadiusKm = 15,
        CancellationToken ct = default)
    {
        var existing = await db.FleetSettings.IgnoreQueryFilters()
            .FirstOrDefaultAsync(fs => fs.FleetId == fleetId, ct);
        if (existing is not null)
        {
            existing.AutoDispatchEnabled = enabled;
            existing.AutoDispatchAfterSeconds = afterSeconds;
            existing.MaxOfferRadiusKm = maxRadiusKm;
        }
        else
        {
            db.FleetSettings.Add(new FleetSettings
            {
                FleetId = fleetId,
                AutoDispatchEnabled = enabled,
                AutoDispatchAfterSeconds = afterSeconds,
                MaxOfferRadiusKm = maxRadiusKm
            });
        }
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Builds a <c>New</c> order at the pickup coordinates, created <paramref name="createdSecondsAgo"/> seconds ago.</summary>
    private static Order BuildNewOrder(Fleet fleet, double pickupLat = 50.08, double pickupLng = 14.42, int createdSecondsAgo = 90) =>
        new()
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            PublicCode = $"A{Guid.NewGuid():N}"[..6].ToUpperInvariant(),
            Status = OrderStatus.New,
            CustomerPhone = "+420600000099",
            PickupAddress = "Test Pickup St",
            PickupLat = pickupLat,
            PickupLng = pickupLng,
            Source = OrderSource.Dispatcher,
            PriceType = PriceType.Estimate,
            CreatedAt = FixedNow.AddSeconds(-createdSecondsAgo),
            UpdatedAt = FixedNow.AddSeconds(-createdSecondsAgo),
            Version = 1
        };

    /// <summary>Opens a null-tenant scope for seeding / assertions that bypass the query filter.</summary>
    private (IServiceScope Scope, TaxiDbContext Db) OpenNullTenantScope(TaxiApiFactory factory)
    {
        var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        return (scope, db);
    }

    /// <summary>Creates an <see cref="AutoDispatchJob"/> from the factory's DI container.</summary>
    private static AutoDispatchJob CreateJob(TaxiApiFactory factory) =>
        new(factory.Services.GetRequiredService<IServiceScopeFactory>(),
            factory.FakeTime,
            NullLogger<AutoDispatchJob>.Instance);

    // ── Tests ─────────────────────────────────────────────────────────────────

    /// <summary>AC#1 / spec 1: New order older than AutoDispatchAfterSeconds with one eligible
    /// in-radius Free driver → order becomes Assigned to that driver with one Assigned event.</summary>
    [Fact]
    public async Task RunTick_NewOrderOneEligibleInRadiusDriver_AssignsToThatDriver()
    {
        var ct = TestContext.Current.CancellationToken;
        using var factory = new TaxiApiFactory(fixture.ConnectionString);

        var (scope, db) = OpenNullTenantScope(factory);
        using (scope)
        {
            var (fleet, driver, _, _) = await SeedFleetAndDriver(db, ct);
            await SeedAutoDispatchSettings(db, fleet.Id, afterSeconds: 60, maxRadiusKm: 15, ct: ct);

            // Driver near pickup; position fresh.
            driver.LastLat = 50.08;
            driver.LastLng = 14.42;
            driver.LastPositionAt = FixedNow.AddMinutes(-1);
            await db.SaveChangesAsync(ct);

            // New order created 90 s ago (> 60 s threshold).
            var order = BuildNewOrder(fleet, pickupLat: 50.08, pickupLng: 14.42, createdSecondsAgo: 90);
            db.Orders.Add(order);
            await db.SaveChangesAsync(ct);

            var job = CreateJob(factory);
            await job.RunTickAsync(ct);

            var updatedOrder = await db.Orders.IgnoreQueryFilters().AsNoTracking()
                .FirstAsync(o => o.Id == order.Id, ct);
            updatedOrder.Status.Should().Be(OrderStatus.Assigned);
            updatedOrder.DriverId.Should().Be(driver.Id);

            var assignedEvents = await db.OrderEvents.IgnoreQueryFilters().AsNoTracking()
                .Where(e => e.OrderId == order.Id && e.Type == OrderEventType.Assigned)
                .ToListAsync(ct);
            assignedEvents.Should().HaveCount(1, "exactly one Assigned event must be written");
        }
    }

    /// <summary>Spec 2: Two eligible drivers in radius → nearest driver is assigned.</summary>
    [Fact]
    public async Task RunTick_TwoEligibleDrivers_NearestAssigned()
    {
        var ct = TestContext.Current.CancellationToken;
        using var factory = new TaxiApiFactory(fixture.ConnectionString);

        var (scope, db) = OpenNullTenantScope(factory);
        using (scope)
        {
            var (fleet, driverNear, _, _) = await SeedFleetAndDriver(db, ct);
            var (_, driverFar, _, _) = await SeedFleetAndDriver(db, ct);

            // Move driverFar to the same fleet.
            driverFar.FleetId = fleet.Id;
            await SeedAutoDispatchSettings(db, fleet.Id, afterSeconds: 60, maxRadiusKm: 15, ct: ct);

            // Near driver: 0.1 km from pickup.
            driverNear.LastLat = 50.081;
            driverNear.LastLng = 14.42;
            driverNear.LastPositionAt = FixedNow.AddMinutes(-1);

            // Far driver: ~5 km from pickup.
            driverFar.LastLat = 50.125;
            driverFar.LastLng = 14.42;
            driverFar.LastPositionAt = FixedNow.AddMinutes(-1);

            await db.SaveChangesAsync(ct);

            var order = BuildNewOrder(fleet, pickupLat: 50.08, pickupLng: 14.42, createdSecondsAgo: 90);
            db.Orders.Add(order);
            await db.SaveChangesAsync(ct);

            var job = CreateJob(factory);
            await job.RunTickAsync(ct);

            var updatedOrder = await db.Orders.IgnoreQueryFilters().AsNoTracking()
                .FirstAsync(o => o.Id == order.Id, ct);
            updatedOrder.Status.Should().Be(OrderStatus.Assigned);
            updatedOrder.DriverId.Should().Be(driverNear.Id, "nearest driver should be assigned");
        }
    }

    /// <summary>Spec 3: Driver outside radius → order stays New.</summary>
    [Fact]
    public async Task RunTick_DriverOutsideRadius_OrderStaysNew()
    {
        var ct = TestContext.Current.CancellationToken;
        using var factory = new TaxiApiFactory(fixture.ConnectionString);

        var (scope, db) = OpenNullTenantScope(factory);
        using (scope)
        {
            var (fleet, driver, _, _) = await SeedFleetAndDriver(db, ct);
            await SeedAutoDispatchSettings(db, fleet.Id, afterSeconds: 60, maxRadiusKm: 5, ct: ct);

            // Driver ~50 km from pickup.
            driver.LastLat = 50.53;
            driver.LastLng = 14.42;
            driver.LastPositionAt = FixedNow.AddMinutes(-1);
            await db.SaveChangesAsync(ct);

            var order = BuildNewOrder(fleet, pickupLat: 50.08, pickupLng: 14.42, createdSecondsAgo: 90);
            db.Orders.Add(order);
            await db.SaveChangesAsync(ct);

            var job = CreateJob(factory);
            await job.RunTickAsync(ct);

            var updatedOrder = await db.Orders.IgnoreQueryFilters().AsNoTracking()
                .FirstAsync(o => o.Id == order.Id, ct);
            updatedOrder.Status.Should().Be(OrderStatus.New, "driver outside radius should not be assigned");
        }
    }

    /// <summary>Spec 4 / AC#2: Previously timed-out driver is excluded; next-nearest assigned.
    /// When pool exhausted → stays New.</summary>
    [Fact]
    public async Task RunTick_TimedOutDriverExcluded_NextNearestAssigned()
    {
        var ct = TestContext.Current.CancellationToken;
        using var factory = new TaxiApiFactory(fixture.ConnectionString);

        var (scope, db) = OpenNullTenantScope(factory);
        using (scope)
        {
            var (fleet, driverA, _, dispatcherUserId) = await SeedFleetAndDriver(db, ct);
            var (_, driverB, _, _) = await SeedFleetAndDriver(db, ct);

            // Move driverB to the same fleet.
            driverB.FleetId = fleet.Id;
            await SeedAutoDispatchSettings(db, fleet.Id, afterSeconds: 60, maxRadiusKm: 15, ct: ct);

            // Both drivers near pickup; position fresh.
            driverA.LastLat = 50.081;
            driverA.LastLng = 14.42;
            driverA.LastPositionAt = FixedNow.AddMinutes(-1);

            driverB.LastLat = 50.083;
            driverB.LastLng = 14.42;
            driverB.LastPositionAt = FixedNow.AddMinutes(-1);

            await db.SaveChangesAsync(ct);

            var order = BuildNewOrder(fleet, pickupLat: 50.08, pickupLng: 14.42, createdSecondsAgo: 90);
            db.Orders.Add(order);
            await db.SaveChangesAsync(ct);

            // Seed a Timeout event for driverA (it was previously offered and timed out).
            // ActorUserId = null matches Actor.System.
            var timeoutPayload = System.Text.Json.JsonDocument.Parse(
                $$$"""{"timedOutDriverId":"{{{driverA.Id}}}","reason":"timeout"}""");
            var timeoutEvent = new OrderEvent
            {
                Id = Guid.CreateVersion7(),
                FleetId = fleet.Id,
                OrderId = order.Id,
                Type = OrderEventType.Timeout,
                FromStatus = OrderStatus.Assigned,
                ToStatus = OrderStatus.New,
                ActorRole = UserRole.System,
                At = FixedNow.AddMinutes(-3),
                ActorUserId = null,
                Payload = timeoutPayload
            };
            db.OrderEvents.Add(timeoutEvent);
            await db.SaveChangesAsync(ct);

            var job = CreateJob(factory);
            await job.RunTickAsync(ct);

            // driverB (next nearest) should be assigned.
            var updatedOrder = await db.Orders.IgnoreQueryFilters().AsNoTracking()
                .FirstAsync(o => o.Id == order.Id, ct);
            updatedOrder.Status.Should().Be(OrderStatus.Assigned);
            updatedOrder.DriverId.Should().Be(driverB.Id, "timed-out driverA should be excluded; driverB assigned");
        }
    }

    /// <summary>Spec 5 / AC#3: AutoDispatchEnabled=false → order untouched.</summary>
    [Fact]
    public async Task RunTick_AutoDispatchDisabled_OrderUntouched()
    {
        var ct = TestContext.Current.CancellationToken;
        using var factory = new TaxiApiFactory(fixture.ConnectionString);

        var (scope, db) = OpenNullTenantScope(factory);
        using (scope)
        {
            var (fleet, driver, _, _) = await SeedFleetAndDriver(db, ct);
            await SeedAutoDispatchSettings(db, fleet.Id, enabled: false, afterSeconds: 60, ct: ct);

            driver.LastLat = 50.08;
            driver.LastLng = 14.42;
            driver.LastPositionAt = FixedNow.AddMinutes(-1);
            await db.SaveChangesAsync(ct);

            var order = BuildNewOrder(fleet, createdSecondsAgo: 90);
            db.Orders.Add(order);
            await db.SaveChangesAsync(ct);

            var job = CreateJob(factory);
            await job.RunTickAsync(ct);

            var updatedOrder = await db.Orders.IgnoreQueryFilters().AsNoTracking()
                .FirstAsync(o => o.Id == order.Id, ct);
            updatedOrder.Status.Should().Be(OrderStatus.New, "disabled fleet should not be dispatched");
        }
    }

    /// <summary>Spec 5 / AC#3: No FleetSettings row → order untouched (opt-in, no safe default).</summary>
    [Fact]
    public async Task RunTick_NoSettingsRow_OrderUntouched()
    {
        var ct = TestContext.Current.CancellationToken;
        using var factory = new TaxiApiFactory(fixture.ConnectionString);

        var (scope, db) = OpenNullTenantScope(factory);
        using (scope)
        {
            var (fleet, driver, _, _) = await SeedFleetAndDriver(db, ct);
            // No FleetSettings row seeded.

            driver.LastLat = 50.08;
            driver.LastLng = 14.42;
            driver.LastPositionAt = FixedNow.AddMinutes(-1);
            await db.SaveChangesAsync(ct);

            var order = BuildNewOrder(fleet, createdSecondsAgo: 90);
            db.Orders.Add(order);
            await db.SaveChangesAsync(ct);

            var job = CreateJob(factory);
            await job.RunTickAsync(ct);

            var updatedOrder = await db.Orders.IgnoreQueryFilters().AsNoTracking()
                .FirstAsync(o => o.Id == order.Id, ct);
            updatedOrder.Status.Should().Be(OrderStatus.New, "no settings row → skip (no safe default)");
        }
    }

    /// <summary>Spec 5: Not-yet-elapsed (CreatedAt + AfterSeconds &gt; now) → order untouched.</summary>
    [Fact]
    public async Task RunTick_NotYetElapsed_OrderUntouched()
    {
        var ct = TestContext.Current.CancellationToken;
        using var factory = new TaxiApiFactory(fixture.ConnectionString);

        var (scope, db) = OpenNullTenantScope(factory);
        using (scope)
        {
            var (fleet, driver, _, _) = await SeedFleetAndDriver(db, ct);
            await SeedAutoDispatchSettings(db, fleet.Id, afterSeconds: 60, ct: ct);

            driver.LastLat = 50.08;
            driver.LastLng = 14.42;
            driver.LastPositionAt = FixedNow.AddMinutes(-1);
            await db.SaveChangesAsync(ct);

            // Created only 30 s ago; threshold is 60 s.
            var order = BuildNewOrder(fleet, createdSecondsAgo: 30);
            db.Orders.Add(order);
            await db.SaveChangesAsync(ct);

            var job = CreateJob(factory);
            await job.RunTickAsync(ct);

            var updatedOrder = await db.Orders.IgnoreQueryFilters().AsNoTracking()
                .FirstAsync(o => o.Id == order.Id, ct);
            updatedOrder.Status.Should().Be(OrderStatus.New, "not-yet-elapsed order should not be dispatched");
        }
    }

    /// <summary>Assumption 2: Future ScheduledAt → not dispatched even when past AfterSeconds.</summary>
    [Fact]
    public async Task RunTick_FutureScheduledAt_OrderUntouched()
    {
        var ct = TestContext.Current.CancellationToken;
        using var factory = new TaxiApiFactory(fixture.ConnectionString);

        var (scope, db) = OpenNullTenantScope(factory);
        using (scope)
        {
            var (fleet, driver, _, _) = await SeedFleetAndDriver(db, ct);
            await SeedAutoDispatchSettings(db, fleet.Id, afterSeconds: 60, ct: ct);

            driver.LastLat = 50.08;
            driver.LastLng = 14.42;
            driver.LastPositionAt = FixedNow.AddMinutes(-1);
            await db.SaveChangesAsync(ct);

            // Order created 90 s ago but ScheduledAt is tomorrow.
            var order = BuildNewOrder(fleet, createdSecondsAgo: 90);
            order.ScheduledAt = FixedNow.AddDays(1);
            db.Orders.Add(order);
            await db.SaveChangesAsync(ct);

            var job = CreateJob(factory);
            await job.RunTickAsync(ct);

            var updatedOrder = await db.Orders.IgnoreQueryFilters().AsNoTracking()
                .FirstAsync(o => o.Id == order.Id, ct);
            updatedOrder.Status.Should().Be(OrderStatus.New, "future ScheduledAt should not be dispatched");
        }
    }

    /// <summary>Spec 6 / AC#3: Offline and stale-position drivers excluded → order stays New.</summary>
    [Fact]
    public async Task RunTick_OfflineAndStaleDrivers_OrderStaysNew()
    {
        var ct = TestContext.Current.CancellationToken;
        using var factory = new TaxiApiFactory(fixture.ConnectionString);

        var (scope, db) = OpenNullTenantScope(factory);
        using (scope)
        {
            var (fleet, offlineDriver, _, _) = await SeedFleetAndDriver(db, ct);
            var (_, staleDriver, _, _) = await SeedFleetAndDriver(db, ct);
            staleDriver.FleetId = fleet.Id;

            await SeedAutoDispatchSettings(db, fleet.Id, afterSeconds: 60, maxRadiusKm: 15, ct: ct);

            // Offline driver: near but Offline.
            offlineDriver.Status = DriverStatus.Offline;
            offlineDriver.LastLat = 50.08;
            offlineDriver.LastLng = 14.42;
            offlineDriver.LastPositionAt = FixedNow.AddMinutes(-1);

            // Stale driver: Free but stale position (7 min ago).
            staleDriver.Status = DriverStatus.Free;
            staleDriver.LastLat = 50.08;
            staleDriver.LastLng = 14.42;
            staleDriver.LastPositionAt = FixedNow.AddMinutes(-7);

            await db.SaveChangesAsync(ct);

            var order = BuildNewOrder(fleet, createdSecondsAgo: 90);
            db.Orders.Add(order);
            await db.SaveChangesAsync(ct);

            var job = CreateJob(factory);
            await job.RunTickAsync(ct);

            var updatedOrder = await db.Orders.IgnoreQueryFilters().AsNoTracking()
                .FirstAsync(o => o.Id == order.Id, ct);
            updatedOrder.Status.Should().Be(OrderStatus.New, "offline and stale drivers must not be assigned");
        }
    }

    /// <summary>Assumption 6 within-tick guard: Two New orders, one eligible driver → exactly one assigned,
    /// the other stays New. The per-order pending-offer exclusion prevents double-assignment within a tick.</summary>
    [Fact]
    public async Task RunTick_TwoNewOrdersOneEligibleDriver_AssignsExactlyOne()
    {
        var ct = TestContext.Current.CancellationToken;
        using var factory = new TaxiApiFactory(fixture.ConnectionString);

        var (scope, db) = OpenNullTenantScope(factory);
        using (scope)
        {
            var (fleet, driver, _, _) = await SeedFleetAndDriver(db, ct);
            await SeedAutoDispatchSettings(db, fleet.Id, afterSeconds: 60, maxRadiusKm: 15, ct: ct);

            driver.LastLat = 50.08;
            driver.LastLng = 14.42;
            driver.LastPositionAt = FixedNow.AddMinutes(-1);
            await db.SaveChangesAsync(ct);

            var orderA = BuildNewOrder(fleet, pickupLat: 50.08, pickupLng: 14.42, createdSecondsAgo: 90);
            var orderB = BuildNewOrder(fleet, pickupLat: 50.09, pickupLng: 14.42, createdSecondsAgo: 90);
            db.Orders.AddRange(orderA, orderB);
            await db.SaveChangesAsync(ct);

            var job = CreateJob(factory);
            await job.RunTickAsync(ct);

            var updatedA = await db.Orders.IgnoreQueryFilters().AsNoTracking()
                .FirstAsync(o => o.Id == orderA.Id, ct);
            var updatedB = await db.Orders.IgnoreQueryFilters().AsNoTracking()
                .FirstAsync(o => o.Id == orderB.Id, ct);

            var assignedCount = (updatedA.Status == OrderStatus.Assigned ? 1 : 0)
                              + (updatedB.Status == OrderStatus.Assigned ? 1 : 0);
            assignedCount.Should().Be(1, "exactly one order should be assigned to the single eligible driver");

            var newCount = (updatedA.Status == OrderStatus.New ? 1 : 0)
                         + (updatedB.Status == OrderStatus.New ? 1 : 0);
            newCount.Should().Be(1, "the other order should stay New");
        }
    }

    /// <summary>Spec 7 / AC#5: Fleet A dispatch never touches fleet B orders.</summary>
    [Fact]
    public async Task RunTick_TenantIsolation_FleetBOrderUnaffected()
    {
        var ct = TestContext.Current.CancellationToken;
        using var factory = new TaxiApiFactory(fixture.ConnectionString);

        var (scope, db) = OpenNullTenantScope(factory);
        using (scope)
        {
            var (fleetA, driverA, _, _) = await SeedFleetAndDriver(db, ct);
            var (fleetB, driverB, _, _) = await SeedFleetAndDriver(db, ct);

            await SeedAutoDispatchSettings(db, fleetA.Id, afterSeconds: 60, maxRadiusKm: 15, ct: ct);
            // Fleet B has no AutoDispatch settings → untouched.

            driverA.LastLat = 50.08;
            driverA.LastLng = 14.42;
            driverA.LastPositionAt = FixedNow.AddMinutes(-1);

            driverB.LastLat = 50.08;
            driverB.LastLng = 14.42;
            driverB.LastPositionAt = FixedNow.AddMinutes(-1);
            await db.SaveChangesAsync(ct);

            var orderA = BuildNewOrder(fleetA, createdSecondsAgo: 90);
            var orderB = BuildNewOrder(fleetB, createdSecondsAgo: 90);
            db.Orders.AddRange(orderA, orderB);
            await db.SaveChangesAsync(ct);

            var job = CreateJob(factory);
            await job.RunTickAsync(ct);

            var updatedA = await db.Orders.IgnoreQueryFilters().AsNoTracking()
                .FirstAsync(o => o.Id == orderA.Id, ct);
            updatedA.Status.Should().Be(OrderStatus.Assigned, "fleet A order should be assigned");
            updatedA.DriverId.Should().Be(driverA.Id, "fleet A driver should be used (tenant isolation)");

            var updatedB = await db.Orders.IgnoreQueryFilters().AsNoTracking()
                .FirstAsync(o => o.Id == orderB.Id, ct);
            updatedB.Status.Should().Be(OrderStatus.New, "fleet B order must not be touched (no auto-dispatch settings)");
        }
    }

    /// <summary>Spec 8 / AC#4: Manual assign wins race → job no-op, no exception, order stays Assigned to manual driver.</summary>
    [Fact]
    public async Task RunTick_ManualAssignWinsRace_JobNoOp()
    {
        var ct = TestContext.Current.CancellationToken;
        using var factory = new TaxiApiFactory(fixture.ConnectionString);

        var (scope, db) = OpenNullTenantScope(factory);
        using (scope)
        {
            var (fleet, driver, _, dispatcherUserId) = await SeedFleetAndDriver(db, ct);
            await SeedAutoDispatchSettings(db, fleet.Id, afterSeconds: 60, maxRadiusKm: 15, ct: ct);

            driver.LastLat = 50.08;
            driver.LastLng = 14.42;
            driver.LastPositionAt = FixedNow.AddMinutes(-1);
            await db.SaveChangesAsync(ct);

            // Order was manually assigned before the tick — it is already Assigned.
            var order = BuildNewOrder(fleet, createdSecondsAgo: 90);
            order.Status = OrderStatus.Assigned;
            order.DriverId = driver.Id;
            order.AssignedAt = FixedNow.AddSeconds(-5);
            db.Orders.Add(order);

            // Write a manual Assigned event (seeded directly to simulate manual dispatcher action).
            var assignedEvent = new OrderEvent
            {
                Id = Guid.CreateVersion7(),
                FleetId = fleet.Id,
                OrderId = order.Id,
                Type = OrderEventType.Assigned,
                FromStatus = OrderStatus.New,
                ToStatus = OrderStatus.Assigned,
                ActorRole = UserRole.Dispatcher,
                At = FixedNow.AddSeconds(-5),
                ActorUserId = dispatcherUserId
            };
            db.OrderEvents.Add(assignedEvent);
            await db.SaveChangesAsync(ct);

            var job = CreateJob(factory);

            // Should not throw.
            var act = async () => await job.RunTickAsync(ct);
            await act.Should().NotThrowAsync("race condition must be handled gracefully");

            var updatedOrder = await db.Orders.IgnoreQueryFilters().AsNoTracking()
                .FirstAsync(o => o.Id == order.Id, ct);
            updatedOrder.Status.Should().Be(OrderStatus.Assigned, "manually assigned order stays Assigned");
            updatedOrder.DriverId.Should().Be(driver.Id, "manual driver retained");

            var events = await db.OrderEvents.IgnoreQueryFilters().AsNoTracking()
                .Where(e => e.OrderId == order.Id && e.Type == OrderEventType.Assigned)
                .ToListAsync(ct);
            events.Should().HaveCount(1, "no second Assigned event added by job");
        }
    }

    /// <summary>Spec 8 / AC#4 concurrent-tick race path: two ticks run concurrently against the same
    /// New order with one eligible driver. One tick wins the Version optimistic-concurrency token;
    /// the other hits the <c>StaleVersion</c>/<c>IllegalTransition</c> else-branch in
    /// <see cref="AutoDispatchJob"/> and is silently skipped. Exactly one <c>Assigned</c> event
    /// is written and the order ends in <c>Assigned</c> status — no exception propagates, no duplicate event.</summary>
    [Fact]
    public async Task RunTick_TwoConcurrentTicks_ExactlyOneAssignedEvent()
    {
        var ct = TestContext.Current.CancellationToken;
        // Dedicated factory so FakeTime is not shared with the PostgresFixture.Factory.
        using var factory = new TaxiApiFactory(fixture.ConnectionString);

        var (scope, db) = OpenNullTenantScope(factory);
        using (scope)
        {
            var (fleet, driver, _, _) = await SeedFleetAndDriver(db, ct);
            await SeedAutoDispatchSettings(db, fleet.Id, afterSeconds: 60, maxRadiusKm: 15, ct: ct);

            driver.LastLat = 50.08;
            driver.LastLng = 14.42;
            driver.LastPositionAt = FixedNow.AddMinutes(-1);
            await db.SaveChangesAsync(ct);

            var order = BuildNewOrder(fleet, createdSecondsAgo: 90);
            db.Orders.Add(order);
            await db.SaveChangesAsync(ct);

            var job = CreateJob(factory);

            // Run two ticks concurrently against the same New order.
            // One will win the optimistic-concurrency Version token and commit Assigned.
            // The other will receive StaleVersion or IllegalTransition from TransitionAsync
            // and silently log at Debug — no exception, no second event.
            await Task.WhenAll(
                job.RunTickAsync(ct),
                job.RunTickAsync(ct));

            var updatedOrder = await db.Orders.IgnoreQueryFilters().AsNoTracking()
                .FirstAsync(o => o.Id == order.Id, ct);
            updatedOrder.Status.Should().Be(OrderStatus.Assigned, "order is Assigned after concurrent ticks");

            var assignedEvents = await db.OrderEvents.IgnoreQueryFilters().AsNoTracking()
                .Where(e => e.OrderId == order.Id && e.Type == OrderEventType.Assigned)
                .ToListAsync(ct);
            assignedEvents.Should().HaveCount(1, "exactly one Assigned event regardless of concurrent ticks");
        }
    }
}

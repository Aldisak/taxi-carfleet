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

/// <summary>Integration tests for <see cref="OfferTimeoutJob"/> and <see cref="StalePositionJob"/>.
/// Tests drive the job tick logic directly via <c>RunTickAsync</c> — deterministic, no timer waits.
/// <para><b>Timer testability pattern:</b> each job exposes an internal <c>RunTickAsync(CancellationToken)</c>
/// method that contains all per-tick business logic. The <c>BackgroundService.ExecuteAsync</c> loop is a
/// thin shell (PeriodicTimer → await RunTickAsync). Tests construct job instances manually and call
/// RunTickAsync directly, avoiding the need to advance the PeriodicTimer from integration tests.</para>
/// </summary>
[Collection(TestCollections.Database)]
public sealed class BackgroundJobTests(PostgresFixture fixture)
{
    private static readonly DateTimeOffset FixedNow = new(2026, 9, 10, 12, 0, 0, TimeSpan.Zero);

    // ── Seed helpers ──────────────────────────────────────────────────────────

    /// <summary>Seeds a fleet and its settings, a dispatcher user, a vehicle, and a driver.
    /// Returns a null-tenant DbContext for direct data manipulation.</summary>
    private static async Task<(Fleet fleet, Driver driver, Guid driverUserId, Guid dispatcherUserId)>
        SeedFleetAndDriver(TaxiDbContext db, CancellationToken ct = default)
    {
        var suffix = Guid.NewGuid().ToString("N");

        var fleet = new Fleet
        {
            Id = Guid.CreateVersion7(),
            Slug = $"jobs-{suffix[..8]}",
            Name = "Jobs Test Fleet",
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
            Plate = $"JB{suffix[..4].ToUpperInvariant()}",
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
            DisplayName = "Jobs Dispatcher",
            IsActive = true,
            CreatedAt = FixedNow
        };
        var driverUser = new User
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            Role = UserRole.Driver,
            Phone = $"+4206002{suffix[..9]}",
            DisplayName = "Jobs Driver",
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

    private static Order BuildAssignedOrder(Fleet fleet, Guid driverId, Guid vehicleId, DateTimeOffset assignedAt) =>
        new()
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            PublicCode = $"T{Guid.NewGuid():N}"[..6].ToUpperInvariant(),
            Status = OrderStatus.Assigned,
            CustomerPhone = "+420600000099",
            PickupAddress = "Test Pickup St",
            Source = OrderSource.Dispatcher,
            PriceType = PriceType.Estimate,
            DriverId = driverId,
            VehicleId = vehicleId,
            AssignedAt = assignedAt,
            CreatedAt = assignedAt.AddMinutes(-1),
            UpdatedAt = assignedAt,
            Version = 1
        };

    /// <summary>Opens a null-tenant scope for seeding / assertions that bypass the query filter.</summary>
    private (IServiceScope Scope, TaxiDbContext Db) OpenNullTenantScope(TaxiApiFactory factory)
    {
        var scope = factory.Services.CreateScope();
        // No FleetId set → null-tenant → IgnoreQueryFilters bypasses filter; SaveChanges guard passes.
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        return (scope, db);
    }

    // ── OfferTimeoutJob tests ─────────────────────────────────────────────────

    /// <summary>Verifies that an Assigned order older than FleetSettings.OfferTimeoutSeconds
    /// is transitioned back to New and a Timeout OrderEvent is written.</summary>
    [Fact]
    public async Task OfferTimeoutJob_AssignedPastTimeout_TimesOutToNew()
    {
        var ct = TestContext.Current.CancellationToken;
        using var factory = new TaxiApiFactory(fixture.ConnectionString);

        var (scope, db) = OpenNullTenantScope(factory);
        using (scope)
        {
            var (fleet, driver, _, _) = await SeedFleetAndDriver(db, ct);

            // AssignedAt is 46 s in the past; default timeout is 45 s.
            var assignedAt = FixedNow.AddSeconds(-46);
            var order = BuildAssignedOrder(fleet, driver.Id, driver.CurrentVehicleId!.Value, assignedAt);
            db.Orders.Add(order);
            await db.SaveChangesAsync(ct);

            var job = new OfferTimeoutJob(
                factory.Services.GetRequiredService<IServiceScopeFactory>(),
                factory.FakeTime,
                NullLogger<OfferTimeoutJob>.Instance);

            await job.RunTickAsync(ct);

            // Assert order is now New.
            var updatedOrder = await db.Orders.IgnoreQueryFilters()
                .AsNoTracking()
                .FirstAsync(o => o.Id == order.Id, ct);
            updatedOrder.Status.Should().Be(OrderStatus.New);
            updatedOrder.DriverId.Should().BeNull("driver should be released on timeout");

            // Assert Timeout event was written.
            var events = await db.OrderEvents.IgnoreQueryFilters()
                .AsNoTracking()
                .Where(e => e.OrderId == order.Id && e.Type == OrderEventType.Timeout)
                .ToListAsync(ct);
            events.Should().HaveCount(1);
        }
    }

    /// <summary>Verifies that an Assigned order within the timeout window is not touched.</summary>
    [Fact]
    public async Task OfferTimeoutJob_AssignedWithinTimeout_Untouched()
    {
        var ct = TestContext.Current.CancellationToken;
        using var factory = new TaxiApiFactory(fixture.ConnectionString);

        var (scope, db) = OpenNullTenantScope(factory);
        using (scope)
        {
            var (fleet, driver, _, _) = await SeedFleetAndDriver(db, ct);

            // AssignedAt is only 20 s in the past; default timeout is 45 s.
            var assignedAt = FixedNow.AddSeconds(-20);
            var order = BuildAssignedOrder(fleet, driver.Id, driver.CurrentVehicleId!.Value, assignedAt);
            db.Orders.Add(order);
            await db.SaveChangesAsync(ct);

            var job = new OfferTimeoutJob(
                factory.Services.GetRequiredService<IServiceScopeFactory>(),
                factory.FakeTime,
                NullLogger<OfferTimeoutJob>.Instance);

            await job.RunTickAsync(ct);

            var updatedOrder = await db.Orders.IgnoreQueryFilters()
                .AsNoTracking()
                .FirstAsync(o => o.Id == order.Id, ct);
            updatedOrder.Status.Should().Be(OrderStatus.Assigned, "not yet timed out");
        }
    }

    /// <summary>Verifies that running two ticks concurrently times out the order exactly once.
    /// AC #5 concurrency proof: one tick wins via OrderService optimistic concurrency (StaleVersion);
    /// the second tick silently skips (benign log at Debug).</summary>
    [Fact]
    public async Task OfferTimeoutJob_RunsTwiceConcurrently_TimesOutExactlyOnce()
    {
        var ct = TestContext.Current.CancellationToken;
        using var factory = new TaxiApiFactory(fixture.ConnectionString);

        var (scope, db) = OpenNullTenantScope(factory);
        using (scope)
        {
            var (fleet, driver, _, _) = await SeedFleetAndDriver(db, ct);

            var assignedAt = FixedNow.AddSeconds(-46);
            var order = BuildAssignedOrder(fleet, driver.Id, driver.CurrentVehicleId!.Value, assignedAt);
            db.Orders.Add(order);
            await db.SaveChangesAsync(ct);

            var job = new OfferTimeoutJob(
                factory.Services.GetRequiredService<IServiceScopeFactory>(),
                factory.FakeTime,
                NullLogger<OfferTimeoutJob>.Instance);

            // Run two ticks concurrently — order must be timed out exactly once.
            await Task.WhenAll(
                job.RunTickAsync(ct),
                job.RunTickAsync(ct));

            var timeoutEvents = await db.OrderEvents.IgnoreQueryFilters()
                .AsNoTracking()
                .Where(e => e.OrderId == order.Id && e.Type == OrderEventType.Timeout)
                .ToListAsync(ct);
            timeoutEvents.Should().HaveCount(1, "exactly one Timeout event even with two concurrent ticks");
        }
    }

    /// <summary>AC #5 restart proof: create + assign, create a FRESH job instance (simulating a restart —
    /// no in-memory state carried over), advance time, tick → order times out.
    /// State lives entirely in the DB, so restarts are transparent.</summary>
    [Fact]
    public async Task OfferTimeoutJob_SurvivesRestart_StillTimesOutFromDbState()
    {
        var ct = TestContext.Current.CancellationToken;
        using var factory = new TaxiApiFactory(fixture.ConnectionString);

        Guid orderId;

        // Phase 1: seed the order as Assigned.
        var (scope, db) = OpenNullTenantScope(factory);
        using (scope)
        {
            var (fleet, driver, _, _) = await SeedFleetAndDriver(db, ct);

            var assignedAt = FixedNow.AddSeconds(-46);
            var order = BuildAssignedOrder(fleet, driver.Id, driver.CurrentVehicleId!.Value, assignedAt);
            db.Orders.Add(order);
            await db.SaveChangesAsync(ct);
            orderId = order.Id;
        }

        // Phase 2: "restart" — new job instance, no in-memory reference to the old order.
        using var factory2 = new TaxiApiFactory(fixture.ConnectionString);
        var freshJob = new OfferTimeoutJob(
            factory2.Services.GetRequiredService<IServiceScopeFactory>(),
            factory2.FakeTime,
            NullLogger<OfferTimeoutJob>.Instance);

        await freshJob.RunTickAsync(ct);

        var (scope3, db3) = OpenNullTenantScope(factory2);
        using (scope3)
        {
            var updatedOrder = await db3.Orders.IgnoreQueryFilters()
                .AsNoTracking()
                .FirstAsync(o => o.Id == orderId, ct);
            updatedOrder.Status.Should().Be(OrderStatus.New, "DB-driven timeout survives restart");

            var events = await db3.OrderEvents.IgnoreQueryFilters()
                .AsNoTracking()
                .Where(e => e.OrderId == orderId && e.Type == OrderEventType.Timeout)
                .ToListAsync(ct);
            events.Should().HaveCount(1);
        }
    }

    /// <summary>Verifies that a fleet with OfferTimeoutSeconds=10 times out after 11 s
    /// while a sibling fleet with default (45 s) timeout at 11 s is untouched.</summary>
    [Fact]
    public async Task OfferTimeoutJob_RespectsPerFleetTimeout()
    {
        var ct = TestContext.Current.CancellationToken;
        using var factory = new TaxiApiFactory(fixture.ConnectionString);

        var (scope, db) = OpenNullTenantScope(factory);
        using (scope)
        {
            var (fleetA, driverA, _, _) = await SeedFleetAndDriver(db, ct);
            var (fleetB, driverB, _, _) = await SeedFleetAndDriver(db, ct);

            // Fleet A: custom 10 s timeout.
            var settingsA = new FleetSettings { FleetId = fleetA.Id, OfferTimeoutSeconds = 10 };
            db.FleetSettings.Add(settingsA);
            await db.SaveChangesAsync(ct);

            // Both orders assigned 11 s ago — fleetA (10s) → timeout; fleetB (default 45s) → untouched.
            var assignedAt = FixedNow.AddSeconds(-11);
            var orderA = BuildAssignedOrder(fleetA, driverA.Id, driverA.CurrentVehicleId!.Value, assignedAt);
            var orderB = BuildAssignedOrder(fleetB, driverB.Id, driverB.CurrentVehicleId!.Value, assignedAt);
            db.Orders.AddRange(orderA, orderB);
            await db.SaveChangesAsync(ct);

            var job = new OfferTimeoutJob(
                factory.Services.GetRequiredService<IServiceScopeFactory>(),
                factory.FakeTime,
                NullLogger<OfferTimeoutJob>.Instance);

            await job.RunTickAsync(ct);

            var updatedA = await db.Orders.IgnoreQueryFilters().AsNoTracking()
                .FirstAsync(o => o.Id == orderA.Id, ct);
            updatedA.Status.Should().Be(OrderStatus.New, "fleetA with 10 s timeout should time out");

            var updatedB = await db.Orders.IgnoreQueryFilters().AsNoTracking()
                .FirstAsync(o => o.Id == orderB.Id, ct);
            updatedB.Status.Should().Be(OrderStatus.Assigned, "fleetB with 45 s default should not time out");
        }
    }

    // ── StalePositionJob tests ────────────────────────────────────────────────

    /// <summary>Verifies that a driver with LastPositionAt older than 5 min is marked Offline,
    /// their open shift is closed, and DriverStatusChanged is published (DB state).</summary>
    [Fact]
    public async Task StalePositionJob_StaleDriver_SetOfflineAndShiftClosed()
    {
        var ct = TestContext.Current.CancellationToken;
        using var factory = new TaxiApiFactory(fixture.ConnectionString);

        var (scope, db) = OpenNullTenantScope(factory);
        using (scope)
        {
            var (fleet, driver, _, _) = await SeedFleetAndDriver(db, ct);

            // LastPositionAt is 6 min in the past → stale.
            driver.LastPositionAt = FixedNow.AddMinutes(-6);
            driver.Status = DriverStatus.Free;
            await db.SaveChangesAsync(ct);

            // Open shift.
            var shift = new DriverShift
            {
                Id = Guid.CreateVersion7(),
                FleetId = fleet.Id,
                DriverId = driver.Id,
                VehicleId = driver.CurrentVehicleId!.Value,
                StartedAt = FixedNow.AddHours(-1)
            };
            db.DriverShifts.Add(shift);
            await db.SaveChangesAsync(ct);

            var job = new StalePositionJob(
                factory.Services.GetRequiredService<IServiceScopeFactory>(),
                factory.FakeTime,
                NullLogger<StalePositionJob>.Instance);

            await job.RunTickAsync(ct);

            var updatedDriver = await db.Drivers.IgnoreQueryFilters().AsNoTracking()
                .FirstAsync(d => d.Id == driver.Id, ct);
            updatedDriver.Status.Should().Be(DriverStatus.Offline);
            updatedDriver.CurrentVehicleId.Should().BeNull("vehicle cleared on offline");

            var updatedShift = await db.DriverShifts.IgnoreQueryFilters().AsNoTracking()
                .FirstAsync(s => s.Id == shift.Id, ct);
            updatedShift.EndedAt.Should().NotBeNull("shift must be closed");
            updatedShift.EndedAt.Should().BeCloseTo(FixedNow, TimeSpan.FromSeconds(1));
        }
    }

    /// <summary>Verifies that a driver with a fresh position (within 5 min) is not marked Offline.</summary>
    [Fact]
    public async Task StalePositionJob_FreshDriver_Untouched()
    {
        var ct = TestContext.Current.CancellationToken;
        using var factory = new TaxiApiFactory(fixture.ConnectionString);

        var (scope, db) = OpenNullTenantScope(factory);
        using (scope)
        {
            var (fleet, driver, _, _) = await SeedFleetAndDriver(db, ct);

            // LastPositionAt is only 2 min in the past → fresh.
            driver.LastPositionAt = FixedNow.AddMinutes(-2);
            driver.Status = DriverStatus.Free;
            await db.SaveChangesAsync(ct);

            var job = new StalePositionJob(
                factory.Services.GetRequiredService<IServiceScopeFactory>(),
                factory.FakeTime,
                NullLogger<StalePositionJob>.Instance);

            await job.RunTickAsync(ct);

            var updatedDriver = await db.Drivers.IgnoreQueryFilters().AsNoTracking()
                .FirstAsync(d => d.Id == driver.Id, ct);
            updatedDriver.Status.Should().Be(DriverStatus.Free, "fresh position should not trigger offline");
        }
    }

}

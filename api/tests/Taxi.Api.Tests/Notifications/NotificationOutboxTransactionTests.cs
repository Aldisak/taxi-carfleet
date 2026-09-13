using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Common.Orders;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Notifications;

/// <summary>AC#3: the notification-outbox insert shares the order-change transaction. A failed commit
/// rolls back BOTH the order change and the outbox rows; a successful commit persists both. Also
/// proves tenant-correct enqueue (A4).</summary>
[Collection(TestCollections.Database)]
public sealed class NotificationOutboxTransactionTests(PostgresFixture fixture)
{
    private static readonly DateTimeOffset Now = new(2026, 9, 10, 12, 0, 0, TimeSpan.Zero);

    private static async Task<(Fleet fleet, Guid customerUserId, Guid dispatcherUserId)>
        SeedAsync(TaxiDbContext db, CancellationToken ct)
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var fleet = new Fleet
        {
            Id = Guid.CreateVersion7(),
            Slug = $"otx-{suffix}",
            Name = "Outbox Tx Fleet",
            Phone = "+420600700001",
            Currency = "CZK",
            TimeZone = "Europe/Prague",
            IsActive = true,
            CreatedAt = Now
        };
        var customer = new User
        {
            Id = Guid.CreateVersion7(),
            FleetId = null,
            Role = UserRole.Customer,
            Phone = $"+420607{suffix}0",
            DisplayName = "Tx Customer",
            IsActive = true,
            CreatedAt = Now
        };
        var dispatcher = new User
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            Role = UserRole.Dispatcher,
            Phone = $"+420608{suffix}0",
            DisplayName = "Tx Dispatcher",
            IsActive = true,
            CreatedAt = Now
        };
        db.Fleets.Add(fleet);
        db.Users.AddRange(customer, dispatcher);
        await db.SaveChangesAsync(ct);
        return (fleet, customer.Id, dispatcher.Id);
    }

    private static Order BuildArrivableOrder(Guid fleetId, Guid customerUserId, Guid driverId, Guid vehicleId) => new()
    {
        Id = Guid.CreateVersion7(),
        FleetId = fleetId,
        PublicCode = $"T{Guid.NewGuid():N}"[..6].ToUpperInvariant(),
        Status = OrderStatus.Accepted,
        Source = OrderSource.Phone,
        CustomerUserId = customerUserId,
        CustomerPhone = "+420600000077",
        PickupAddress = "Tx Pickup",
        PriceType = PriceType.Estimate,
        DriverId = driverId,
        VehicleId = vehicleId,
        AcceptedAt = Now,
        AssignedAt = Now,
        CreatedAt = Now,
        UpdatedAt = Now,
        Version = 1
    };

    private static async Task<(Driver driver, Guid vehicleId)> SeedDriverAsync(TaxiDbContext db, Guid fleetId, CancellationToken ct)
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var vehicle = new Vehicle
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleetId,
            Plate = $"TX{suffix[..4].ToUpperInvariant()}",
            Make = "Skoda",
            Model = "Fabia",
            Color = "Red",
            Seats = 4,
            IsActive = true
        };
        var driverUser = new User
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleetId,
            Role = UserRole.Driver,
            Phone = $"+420606{suffix}1",
            DisplayName = "Tx Driver",
            IsActive = true,
            CreatedAt = Now
        };
        var driver = new Driver
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleetId,
            UserId = driverUser.Id,
            Status = DriverStatus.Busy,
            CurrentVehicleId = vehicle.Id,
            IsActive = true
        };
        db.Vehicles.Add(vehicle);
        db.Users.Add(driverUser);
        db.Drivers.Add(driver);
        await db.SaveChangesAsync(ct);
        return (driver, vehicle.Id);
    }

    /// <summary>A successful Arrive transition persists the order change AND the DriverArrived SMS
    /// outbox row in one transaction.</summary>
    [Fact]
    public async Task NotificationOutbox_WrittenInSameTransaction_OnSuccess()
    {
        var ct = TestContext.Current.CancellationToken;
        using var seedScope = fixture.Factory.Services.CreateScope();
        var seedDb = seedScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var (fleet, customerUserId, _) = await SeedAsync(seedDb, ct);
        var (driver, vehicleId) = await SeedDriverAsync(seedDb, fleet.Id, ct);

        var order = BuildArrivableOrder(fleet.Id, customerUserId, driver.Id, vehicleId);
        seedDb.Orders.Add(order);
        await seedDb.SaveChangesAsync(ct);

        using (var scope = fixture.Factory.Services.CreateScope())
        {
            scope.ServiceProvider.GetRequiredService<CurrentTenant>().FleetId = fleet.Id;
            var svc = scope.ServiceProvider.GetRequiredService<OrderService>();
            var result = await svc.TransitionAsync(order.Id, OrderTransition.Arrive,
                new Actor(driver.UserId, UserRole.Driver, driver.Id), payload: null, ct);
            result.IsSuccess.Should().BeTrue();
        }

        var outbox = await seedDb.NotificationOutbox.IgnoreQueryFilters().AsNoTracking()
            .Where(o => o.OrderId == order.Id).ToListAsync(ct);
        outbox.Should().Contain(o => o.Channel == NotificationChannel.Sms && o.Event == NotificationEvent.DriverArrived,
            "DriverArrived SMS is enqueued in the same transaction as the Arrive transition");
    }

    /// <summary>AC#3: a failed commit (optimistic-concurrency conflict) rolls back BOTH the order
    /// change and the outbox rows — no outbox row persists.</summary>
    [Fact]
    public async Task NotificationOutbox_FailedCommit_RollsBackOutboxAndOrder()
    {
        var ct = TestContext.Current.CancellationToken;
        using var seedScope = fixture.Factory.Services.CreateScope();
        var seedDb = seedScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var (fleet, customerUserId, _) = await SeedAsync(seedDb, ct);
        var (driver, vehicleId) = await SeedDriverAsync(seedDb, fleet.Id, ct);

        var order = BuildArrivableOrder(fleet.Id, customerUserId, driver.Id, vehicleId);
        seedDb.Orders.Add(order);
        await seedDb.SaveChangesAsync(ct);

        // Scope A: the transition scope. Pre-load the order into its OrderService tracking by resolving
        // the service, but first cause a concurrency conflict: bump the Version from a separate scope.
        using var txScope = fixture.Factory.Services.CreateScope();
        txScope.ServiceProvider.GetRequiredService<CurrentTenant>().FleetId = fleet.Id;
        var txDb = txScope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        // Pre-load the order in the transition scope (stale snapshot, Version=1).
        var tracked = await txDb.Orders.FirstAsync(o => o.Id == order.Id, ct);
        tracked.Status.Should().Be(OrderStatus.Accepted);

        // Concurrently bump the order Version in another scope so the transition's SaveChanges fails.
        using (var conflictScope = fixture.Factory.Services.CreateScope())
        {
            conflictScope.ServiceProvider.GetRequiredService<CurrentTenant>().FleetId = fleet.Id;
            var conflictDb = conflictScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
            var o2 = await conflictDb.Orders.FirstAsync(o => o.Id == order.Id, ct);
            o2.Note = "bump";
            o2.Version++;
            await conflictDb.SaveChangesAsync(ct);
        }

        // Run the transition in the stale scope → SaveChanges detects the stale Version → rolls back.
        var svc = txScope.ServiceProvider.GetRequiredService<OrderService>();
        var result = await svc.TransitionAsync(order.Id, OrderTransition.Arrive,
            new Actor(driver.UserId, UserRole.Driver, driver.Id), payload: null, ct);

        result.IsSuccess.Should().BeFalse("the concurrency conflict must fail the transition");
        result.FailureKind.Should().Be(TransitionFailureKind.StaleVersion);

        // No outbox row persisted — the outbox insert rolled back with the failed transaction.
        var outbox = await seedDb.NotificationOutbox.IgnoreQueryFilters().AsNoTracking()
            .Where(o => o.OrderId == order.Id).ToListAsync(ct);
        outbox.Should().BeEmpty("a failed commit rolls back BOTH the order change and the outbox");
    }

    /// <summary>Tenant safety: an order in fleet A never enqueues an outbox row readable by fleet B.</summary>
    [Fact]
    public async Task NotificationOutbox_IsWrittenForCorrectFleet()
    {
        var ct = TestContext.Current.CancellationToken;
        using var seedScope = fixture.Factory.Services.CreateScope();
        var seedDb = seedScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var (fleetA, customerA, _) = await SeedAsync(seedDb, ct);
        var (fleetB, _, _) = await SeedAsync(seedDb, ct);
        var (driverA, vehicleA) = await SeedDriverAsync(seedDb, fleetA.Id, ct);

        var order = BuildArrivableOrder(fleetA.Id, customerA, driverA.Id, vehicleA);
        seedDb.Orders.Add(order);
        await seedDb.SaveChangesAsync(ct);

        using (var scope = fixture.Factory.Services.CreateScope())
        {
            scope.ServiceProvider.GetRequiredService<CurrentTenant>().FleetId = fleetA.Id;
            var svc = scope.ServiceProvider.GetRequiredService<OrderService>();
            await svc.TransitionAsync(order.Id, OrderTransition.Arrive,
                new Actor(driverA.UserId, UserRole.Driver, driverA.Id), payload: null, ct);
        }

        // Fleet B tenant-scoped read sees nothing.
        using var bScope = fixture.Factory.Services.CreateScope();
        bScope.ServiceProvider.GetRequiredService<CurrentTenant>().FleetId = fleetB.Id;
        var bDb = bScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        (await bDb.NotificationOutbox.CountAsync(ct)).Should().Be(0, "fleet B cannot see fleet A's outbox");

        // Fleet A sees the row.
        using var aScope = fixture.Factory.Services.CreateScope();
        aScope.ServiceProvider.GetRequiredService<CurrentTenant>().FleetId = fleetA.Id;
        var aDb = aScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        (await aDb.NotificationOutbox.CountAsync(ct)).Should().BeGreaterThan(0);
    }
}

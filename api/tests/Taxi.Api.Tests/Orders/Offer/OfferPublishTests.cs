using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Time.Testing;
using Taxi.Api.Common.Orders;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Tests.Infrastructure;
using Taxi.Api.Tests.Orders.StateMachine;

namespace Taxi.Api.Tests.Orders.Offer;

/// <summary>Integration tests that verify <see cref="OrderService"/> publishes
/// <c>NewOrderOffered</c> after a successful Assign or Reassign transition.</summary>
[Collection(TestCollections.Database)]
public sealed class OfferPublishTests(PostgresFixture fixture)
{
    private static readonly DateTimeOffset FixedNow = new(2026, 9, 10, 12, 0, 0, TimeSpan.Zero);

    // ── Seed helpers ──────────────────────────────────────────────────────────

    /// <summary>Seeds a fleet, a dispatcher user, a vehicle, and two drivers.</summary>
    private static async Task<(Fleet fleet, Driver driver1, Driver driver2, Guid dispatcherUserId)>
        SeedFleetAndTwoDrivers(TaxiDbContext db, CancellationToken ct = default)
    {
        var suffix = Guid.NewGuid().ToString("N");

        var fleet = new Fleet
        {
            Id = Guid.CreateVersion7(),
            Slug = $"offer-{suffix}",
            Name = "Offer Test Fleet",
            Phone = "+420600888001",
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
            Plate = $"OFR{suffix[..4].ToUpperInvariant()}",
            Make = "Skoda",
            Model = "Octavia",
            Color = "White",
            Seats = 4,
            IsActive = true
        };

        var dispatcherUser = new User
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            Role = UserRole.Dispatcher,
            Phone = $"+4206007{suffix[..9]}",
            DisplayName = "Offer Dispatcher",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        };
        var driverUser1 = new User
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            Role = UserRole.Driver,
            Phone = $"+4206006{suffix[..9]}",
            DisplayName = "Offer Driver 1",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        };
        var driverUser2 = new User
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            Role = UserRole.Driver,
            Phone = $"+4206005{suffix[..9]}",
            DisplayName = "Offer Driver 2",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        };

        var driver1 = new Driver
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            UserId = driverUser1.Id,
            Status = DriverStatus.Free,
            CurrentVehicleId = vehicle.Id,
            IsActive = true
        };
        var driver2 = new Driver
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            UserId = driverUser2.Id,
            Status = DriverStatus.Free,
            CurrentVehicleId = vehicle.Id,
            IsActive = true
        };

        db.Users.Add(dispatcherUser);
        db.Users.Add(driverUser1);
        db.Users.Add(driverUser2);
        db.Vehicles.Add(vehicle);
        db.Drivers.Add(driver1);
        db.Drivers.Add(driver2);
        await db.SaveChangesAsync(ct);

        return (fleet, driver1, driver2, dispatcherUser.Id);
    }

    private static Order BuildOrder(Guid fleetId) => new()
    {
        Id = Guid.CreateVersion7(),
        FleetId = fleetId,
        PublicCode = $"O{Guid.NewGuid():N}"[..6].ToUpperInvariant(),
        Status = OrderStatus.New,
        CustomerPhone = "+420600000088",
        PickupAddress = "Offer Pickup St",
        Source = OrderSource.Dispatcher,
        PriceType = PriceType.Estimate,
        CreatedAt = DateTimeOffset.UtcNow,
        UpdatedAt = DateTimeOffset.UtcNow,
        Version = 1
    };

    private static OrderService CreateOrderService(
        TaxiDbContext db,
        RecordingRealtimePublisher publisher,
        DateTimeOffset? pinnedNow = null)
    {
        var fakeTime = new FakeTimeProvider(pinnedNow ?? FixedNow);
        return new OrderService(db, fakeTime, publisher);
    }

    // ── Test 1: Assign publishes NewOrderOffered ───────────────────────────────

    /// <summary>Verifies that a successful Assign transition publishes NewOrderOffered once,
    /// with the correct driverId.</summary>
    [Fact]
    public async Task Assign_PublishesNewOrderOffered_WithDriverAndExpiresAt()
    {
        var ct = TestContext.Current.CancellationToken;
        var recording = new RecordingRealtimePublisher();

        using var scope = fixture.Factory.Services.CreateScope();
        var tenant = scope.ServiceProvider.GetRequiredService<CurrentTenant>();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        var (fleet, driver1, _, dispatcherUserId) = await SeedFleetAndTwoDrivers(db, ct);
        tenant.FleetId = fleet.Id;

        var order = BuildOrder(fleet.Id);
        db.Orders.Add(order);
        await db.SaveChangesAsync(ct);

        var svc = CreateOrderService(db, recording);
        var result = await svc.TransitionAsync(
            order.Id,
            OrderTransition.Assign,
            new Actor(dispatcherUserId, UserRole.Dispatcher),
            new AssignPayload(driver1.Id, driver1.CurrentVehicleId!.Value),
            ct);

        result.IsSuccess.Should().BeTrue();
        recording.NewOrderOfferedCalls.Should().HaveCount(1, "should publish exactly one offer");
        recording.NewOrderOfferedCalls[0].DriverId.Should().Be(driver1.Id);
    }

    // ── Test 2: Reassign publishes to the NEW driver only ─────────────────────

    /// <summary>Verifies that Reassign publishes NewOrderOffered to the new driver (not the old one).</summary>
    [Fact]
    public async Task Reassign_PublishesNewOrderOffered_ToNewDriver_WithRefreshedExpiresAt()
    {
        var ct = TestContext.Current.CancellationToken;

        using var scope = fixture.Factory.Services.CreateScope();
        var tenant = scope.ServiceProvider.GetRequiredService<CurrentTenant>();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        var (fleet, driver1, driver2, dispatcherUserId) = await SeedFleetAndTwoDrivers(db, ct);
        tenant.FleetId = fleet.Id;

        // First assign to driver1.
        var order = BuildOrder(fleet.Id);
        db.Orders.Add(order);
        await db.SaveChangesAsync(ct);

        var assignRecording = new RecordingRealtimePublisher();
        var svcAssign = CreateOrderService(db, assignRecording);
        await svcAssign.TransitionAsync(
            order.Id,
            OrderTransition.Assign,
            new Actor(dispatcherUserId, UserRole.Dispatcher),
            new AssignPayload(driver1.Id, driver1.CurrentVehicleId!.Value),
            ct);

        // Now reassign to driver2 using a fresh publisher to isolate the reassign calls.
        var reassignRecording = new RecordingRealtimePublisher();
        var svc2 = CreateOrderService(db, reassignRecording, FixedNow.AddSeconds(10));
        var result2 = await svc2.TransitionAsync(
            order.Id,
            OrderTransition.Reassign,
            new Actor(dispatcherUserId, UserRole.Dispatcher),
            new AssignPayload(driver2.Id, driver2.CurrentVehicleId!.Value),
            ct);

        result2.IsSuccess.Should().BeTrue();
        reassignRecording.NewOrderOfferedCalls.Should().HaveCount(1, "should publish exactly one offer on reassign");
        reassignRecording.NewOrderOfferedCalls[0].DriverId.Should().Be(driver2.Id, "should notify the new driver, not the old one");
    }

    // ── Test 3: expiresAt = AssignedAt + fleet timeout ────────────────────────

    /// <summary>Verifies that expiresAt equals AssignedAt plus the fleet's OfferTimeoutSeconds.</summary>
    [Fact]
    public async Task Assign_ExpiresAt_EqualsAssignedAtPlusFleetTimeout()
    {
        var ct = TestContext.Current.CancellationToken;
        var recording = new RecordingRealtimePublisher();

        using var scope = fixture.Factory.Services.CreateScope();
        var tenant = scope.ServiceProvider.GetRequiredService<CurrentTenant>();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        var (fleet, driver1, _, dispatcherUserId) = await SeedFleetAndTwoDrivers(db, ct);
        tenant.FleetId = fleet.Id;

        // Seed a FleetSettings row with a custom timeout.
        const int customTimeout = 60;
        db.FleetSettings.Add(new FleetSettings
        {
            FleetId = fleet.Id,
            OfferTimeoutSeconds = customTimeout
        });
        await db.SaveChangesAsync(ct);

        var order = BuildOrder(fleet.Id);
        db.Orders.Add(order);
        await db.SaveChangesAsync(ct);

        var svc = CreateOrderService(db, recording, FixedNow);
        await svc.TransitionAsync(
            order.Id,
            OrderTransition.Assign,
            new Actor(dispatcherUserId, UserRole.Dispatcher),
            new AssignPayload(driver1.Id, driver1.CurrentVehicleId!.Value),
            ct);

        recording.NewOrderOfferedCalls.Should().HaveCount(1);
        var call = recording.NewOrderOfferedCalls[0];

        // ExpiresAt should equal AssignedAt + customTimeout.
        var dbOrder = await db.Orders.AsNoTracking().FirstAsync(o => o.Id == order.Id, ct);
        call.ExpiresAt.Should().Be(dbOrder.AssignedAt!.Value.AddSeconds(customTimeout));
    }

    // ── Test 4: No FleetSettings row → default 45 s ───────────────────────────

    /// <summary>Verifies that when no FleetSettings row exists, the default 45-second timeout is used.</summary>
    [Fact]
    public async Task Assign_NoFleetSettingsRow_UsesDefault45()
    {
        var ct = TestContext.Current.CancellationToken;
        var recording = new RecordingRealtimePublisher();

        using var scope = fixture.Factory.Services.CreateScope();
        var tenant = scope.ServiceProvider.GetRequiredService<CurrentTenant>();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        var (fleet, driver1, _, dispatcherUserId) = await SeedFleetAndTwoDrivers(db, ct);
        tenant.FleetId = fleet.Id;

        // No FleetSettings row for this fleet.

        var order = BuildOrder(fleet.Id);
        db.Orders.Add(order);
        await db.SaveChangesAsync(ct);

        var svc = CreateOrderService(db, recording, FixedNow);
        await svc.TransitionAsync(
            order.Id,
            OrderTransition.Assign,
            new Actor(dispatcherUserId, UserRole.Dispatcher),
            new AssignPayload(driver1.Id, driver1.CurrentVehicleId!.Value),
            ct);

        recording.NewOrderOfferedCalls.Should().HaveCount(1);
        var call = recording.NewOrderOfferedCalls[0];

        var dbOrder = await db.Orders.AsNoTracking().FirstAsync(o => o.Id == order.Id, ct);
        call.ExpiresAt.Should().Be(dbOrder.AssignedAt!.Value.AddSeconds(45), "default timeout is 45 seconds");
    }

    // ── Test 5: Accept does NOT publish NewOrderOffered ───────────────────────

    /// <summary>Verifies that Accept transition does not publish NewOrderOffered.</summary>
    [Fact]
    public async Task Accept_DoesNotPublishNewOrderOffered()
    {
        var ct = TestContext.Current.CancellationToken;

        using var scope = fixture.Factory.Services.CreateScope();
        var tenant = scope.ServiceProvider.GetRequiredService<CurrentTenant>();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        var (fleet, driver1, _, dispatcherUserId) = await SeedFleetAndTwoDrivers(db, ct);
        tenant.FleetId = fleet.Id;

        // Assign first.
        var order = BuildOrder(fleet.Id);
        db.Orders.Add(order);
        await db.SaveChangesAsync(ct);

        var svcAssign = CreateOrderService(db, new RecordingRealtimePublisher());
        await svcAssign.TransitionAsync(
            order.Id,
            OrderTransition.Assign,
            new Actor(dispatcherUserId, UserRole.Dispatcher),
            new AssignPayload(driver1.Id, driver1.CurrentVehicleId!.Value),
            ct);

        // Now accept — use a fresh recording publisher.
        var acceptRecording = new RecordingRealtimePublisher();
        var svcAccept = CreateOrderService(db, acceptRecording, FixedNow.AddSeconds(5));
        var result = await svcAccept.TransitionAsync(
            order.Id,
            OrderTransition.Accept,
            new Actor(driver1.UserId, UserRole.Driver, driver1.Id),
            null,
            ct);

        result.IsSuccess.Should().BeTrue();
        acceptRecording.NewOrderOfferedCalls.Should().BeEmpty("Accept should not publish NewOrderOffered");
    }
}

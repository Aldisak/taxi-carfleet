using System.Security.Claims;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Tests.Infrastructure;
using RouteEntity = Taxi.Api.Infrastructure.Entities.Route;

namespace Taxi.Api.Tests.Tenancy;

/// <summary>Integration tests verifying multi-tenant query filters, SaveChanges guard, and
/// <see cref="TenantResolutionMiddleware"/> resolution precedence.</summary>
[Collection(TestCollections.Database)]
public sealed class TenancyTests(PostgresFixture fixture)
{
    // ── helpers ──────────────────────────────────────────────────────────────

    /// <summary>Creates an async scope with the current tenant set to <paramref name="fleetId"/>.</summary>
    private static AsyncServiceScope CreateTenantScope(PostgresFixture fix, Guid fleetId, out TaxiDbContext db)
    {
        var scope = fix.Factory.Services.CreateAsyncScope();
        var tenant = scope.ServiceProvider.GetRequiredService<CurrentTenant>();
        tenant.FleetId = fleetId;
        db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        return scope;
    }

    /// <summary>Gives a raw scope with no tenant set (query filters apply with null tenant;
    /// use IgnoreQueryFilters() for seeding reads).</summary>
    private static AsyncServiceScope CreateRawScope(PostgresFixture fix, out TaxiDbContext db)
    {
        var scope = fix.Factory.Services.CreateAsyncScope();
        db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        return scope;
    }

    // ── seed helpers ─────────────────────────────────────────────────────────

    private static Fleet BuildFleet(string slugSuffix) => new()
    {
        Id = Guid.CreateVersion7(),
        Slug = $"fleet-{slugSuffix}",
        Name = $"Fleet {slugSuffix}",
        Phone = "+420777000099",
        Currency = "CZK",
        TimeZone = "Europe/Prague",
        IsActive = true,
        CreatedAt = DateTimeOffset.UtcNow
    };

    private static User BuildStaffUser(Guid fleetId, string phone, string emailSuffix) => new()
    {
        Id = Guid.CreateVersion7(),
        FleetId = fleetId,
        Role = UserRole.Dispatcher,
        Phone = phone,
        Email = $"user-{emailSuffix}@test.local",
        DisplayName = $"User {emailSuffix}",
        IsActive = true,
        CreatedAt = DateTimeOffset.UtcNow
    };

    private static Driver BuildDriver(Guid fleetId, Guid userId) => new()
    {
        Id = Guid.CreateVersion7(),
        FleetId = fleetId,
        UserId = userId,
        Status = DriverStatus.Offline,
        IsActive = true
    };

    private static Vehicle BuildVehicle(Guid fleetId, string plate) => new()
    {
        Id = Guid.CreateVersion7(),
        FleetId = fleetId,
        Plate = plate,
        Make = "Skoda",
        Model = "Octavia",
        Color = "White",
        Seats = 4,
        IsActive = true
    };

    private static Order BuildOrder(Guid fleetId, string publicCode) => new()
    {
        Id = Guid.CreateVersion7(),
        FleetId = fleetId,
        PublicCode = publicCode,
        Status = OrderStatus.New,
        Source = OrderSource.Dispatcher,
        CustomerPhone = "+420777000001",
        PickupAddress = "Test Street 1",
        PickupLat = 49.9,
        PickupLng = 15.2,
        Passengers = 1,
        PriceType = PriceType.Estimate,
        CreatedAt = DateTimeOffset.UtcNow,
        UpdatedAt = DateTimeOffset.UtcNow,
        Version = 0
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Test 1 — Theory: every filtered tenant entity isolates rows per fleet
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>Parameterised theory proving that every tenant-filtered entity type returns only
    /// the rows belonging to the current tenant, covering all 12 filtered entity types.</summary>
    [Theory]
    [MemberData(nameof(TenantEntityNames))]
    public async Task Tenancy_QueryFilter_FleetASeesOnlyFleetARows(string entityName)
    {
        var ct = TestContext.Current.CancellationToken;
        // Include entity name in suffix to ensure no slug collision between concurrent theory cases.
        var suffix = $"{entityName[..Math.Min(4, entityName.Length)]}-{Guid.NewGuid():N}"[..16];

        // ── seed two fleets ──────────────────────────────────────────────────
        Guid fleetAId, fleetBId;
        await using (CreateRawScope(fixture, out var db))
        {
            var fleetA = BuildFleet($"a-{suffix}");
            var fleetB = BuildFleet($"b-{suffix}");
            db.Fleets.AddRange(fleetA, fleetB);
            await db.SaveChangesAsync(ct);
            fleetAId = fleetA.Id;
            fleetBId = fleetB.Id;
        }

        // ── seed one row per fleet for this entity type ──────────────────────
        await SeedEntityRowAsync(entityName, fleetAId, fleetBId, suffix, ct);

        // ── read as fleet A ──────────────────────────────────────────────────
        await using (CreateTenantScope(fixture, fleetAId, out var db))
        {
            await AssertOnlyFleetAVisibleAsync(db, entityName, fleetAId, fleetBId, ct);
        }
    }

    private async Task SeedEntityRowAsync(
        string entityName, Guid fleetAId, Guid fleetBId, string suffix, CancellationToken ct)
    {
        await using var scope = CreateRawScope(fixture, out var db);

        switch (entityName)
        {
            case nameof(Driver):
                {
                    var phoneBase = suffix[..6];
                    var userA = BuildStaffUser(fleetAId, $"+420700{phoneBase}", $"drv-a-{suffix}");
                    var userB = BuildStaffUser(fleetBId, $"+420701{phoneBase}", $"drv-b-{suffix}");
                    db.Users.AddRange(userA, userB);
                    await db.SaveChangesAsync(ct);
                    db.Drivers.AddRange(BuildDriver(fleetAId, userA.Id), BuildDriver(fleetBId, userB.Id));
                    await db.SaveChangesAsync(ct);
                    break;
                }
            case nameof(Vehicle):
                db.Vehicles.AddRange(
                    BuildVehicle(fleetAId, $"VA{suffix[..4]}"),
                    BuildVehicle(fleetBId, $"VB{suffix[..4]}"));
                await db.SaveChangesAsync(ct);
                break;

            case nameof(DriverShift):
                {
                    var ph = suffix[..5];
                    var userA = BuildStaffUser(fleetAId, $"+420702{ph}0", $"sh-a-{suffix}");
                    var userB = BuildStaffUser(fleetBId, $"+420703{ph}0", $"sh-b-{suffix}");
                    db.Users.AddRange(userA, userB);
                    await db.SaveChangesAsync(ct);
                    var driverA = BuildDriver(fleetAId, userA.Id);
                    var driverB = BuildDriver(fleetBId, userB.Id);
                    db.Drivers.AddRange(driverA, driverB);
                    await db.SaveChangesAsync(ct);
                    var vA = BuildVehicle(fleetAId, $"SA{suffix[..4]}");
                    var vB = BuildVehicle(fleetBId, $"SB{suffix[..4]}");
                    db.Vehicles.AddRange(vA, vB);
                    await db.SaveChangesAsync(ct);
                    db.DriverShifts.AddRange(
                        new DriverShift { Id = Guid.CreateVersion7(), FleetId = fleetAId, DriverId = driverA.Id, VehicleId = vA.Id, StartedAt = DateTimeOffset.UtcNow },
                        new DriverShift { Id = Guid.CreateVersion7(), FleetId = fleetBId, DriverId = driverB.Id, VehicleId = vB.Id, StartedAt = DateTimeOffset.UtcNow });
                    await db.SaveChangesAsync(ct);
                    break;
                }
            case nameof(Order):
                db.Orders.AddRange(
                    BuildOrder(fleetAId, $"OA{suffix[..4]}"),
                    BuildOrder(fleetBId, $"OB{suffix[..4]}"));
                await db.SaveChangesAsync(ct);
                break;

            case nameof(OrderEvent):
                {
                    var orderA = BuildOrder(fleetAId, $"EA{suffix[..4]}");
                    var orderB = BuildOrder(fleetBId, $"EB{suffix[..4]}");
                    db.Orders.AddRange(orderA, orderB);
                    await db.SaveChangesAsync(ct);
                    db.OrderEvents.AddRange(
                        new OrderEvent { Id = Guid.CreateVersion7(), FleetId = fleetAId, OrderId = orderA.Id, Type = OrderEventType.Created, ToStatus = OrderStatus.New, ActorRole = UserRole.Dispatcher, At = DateTimeOffset.UtcNow },
                        new OrderEvent { Id = Guid.CreateVersion7(), FleetId = fleetBId, OrderId = orderB.Id, Type = OrderEventType.Created, ToStatus = OrderStatus.New, ActorRole = UserRole.Dispatcher, At = DateTimeOffset.UtcNow });
                    await db.SaveChangesAsync(ct);
                    break;
                }
            case nameof(RouteEntity):
                db.Routes.AddRange(
                    new RouteEntity { Id = Guid.CreateVersion7(), FleetId = fleetAId, Name = $"RouteA-{suffix}", Type = RouteType.PointToPoint, PriceCzk = 100, FromLat = 49.9, FromLng = 15.2, ValidDays = 127, Priority = 1, IsEnabled = true },
                    new RouteEntity { Id = Guid.CreateVersion7(), FleetId = fleetBId, Name = $"RouteB-{suffix}", Type = RouteType.PointToPoint, PriceCzk = 100, FromLat = 49.9, FromLng = 15.2, ValidDays = 127, Priority = 1, IsEnabled = true });
                await db.SaveChangesAsync(ct);
                break;

            case nameof(Zone):
                db.Zones.AddRange(
                    new Zone { Id = Guid.CreateVersion7(), FleetId = fleetAId, Name = $"ZoneA-{suffix}", Shape = ZoneShape.Circle, CenterLat = 49.9, CenterLng = 15.2, RadiusMeters = 1000, IsEnabled = true },
                    new Zone { Id = Guid.CreateVersion7(), FleetId = fleetBId, Name = $"ZoneB-{suffix}", Shape = ZoneShape.Circle, CenterLat = 49.9, CenterLng = 15.2, RadiusMeters = 1000, IsEnabled = true });
                await db.SaveChangesAsync(ct);
                break;

            case nameof(Tariff):
                db.Tariffs.AddRange(
                    new Tariff { Id = Guid.CreateVersion7(), FleetId = fleetAId, Name = $"TariffA-{suffix}", BaseFareCzk = 40, PerKmCzk = 28, PerMinuteWaitingCzk = 5, MinimumFareCzk = 100, IsDefault = false, IsEnabled = true },
                    new Tariff { Id = Guid.CreateVersion7(), FleetId = fleetBId, Name = $"TariffB-{suffix}", BaseFareCzk = 40, PerKmCzk = 28, PerMinuteWaitingCzk = 5, MinimumFareCzk = 100, IsDefault = false, IsEnabled = true });
                await db.SaveChangesAsync(ct);
                break;

            case nameof(FleetSettings):
                db.FleetSettings.AddRange(
                    new FleetSettings { FleetId = fleetAId },
                    new FleetSettings { FleetId = fleetBId });
                await db.SaveChangesAsync(ct);
                break;

            case nameof(AuditLog):
                db.AuditLogs.AddRange(
                    new AuditLog { Id = Guid.CreateVersion7(), FleetId = fleetAId, Entity = "Vehicle", EntityId = Guid.CreateVersion7(), Action = "Create", At = DateTimeOffset.UtcNow },
                    new AuditLog { Id = Guid.CreateVersion7(), FleetId = fleetBId, Entity = "Vehicle", EntityId = Guid.CreateVersion7(), Action = "Create", At = DateTimeOffset.UtcNow });
                await db.SaveChangesAsync(ct);
                break;

            case nameof(User):
                {
                    var ph = suffix[..6];
                    var userA = BuildStaffUser(fleetAId, $"+420704{ph}", $"u-a-{suffix}");
                    var userB = BuildStaffUser(fleetBId, $"+420705{ph}", $"u-b-{suffix}");
                    db.Users.AddRange(userA, userB);
                    await db.SaveChangesAsync(ct);
                    break;
                }
            case nameof(PushSubscription):
                {
                    var ph = suffix[..6];
                    var userA = BuildStaffUser(fleetAId, $"+420706{ph}", $"ps-a-{suffix}");
                    var userB = BuildStaffUser(fleetBId, $"+420707{ph}", $"ps-b-{suffix}");
                    db.Users.AddRange(userA, userB);
                    await db.SaveChangesAsync(ct);
                    db.PushSubscriptions.AddRange(
                        new PushSubscription { Id = Guid.CreateVersion7(), FleetId = fleetAId, UserId = userA.Id, Endpoint = $"https://push.test/a/{suffix}", P256dh = "dGVzdA==", Auth = "dGVzdA==", CreatedAt = DateTimeOffset.UtcNow },
                        new PushSubscription { Id = Guid.CreateVersion7(), FleetId = fleetBId, UserId = userB.Id, Endpoint = $"https://push.test/b/{suffix}", P256dh = "dGVzdA==", Auth = "dGVzdA==", CreatedAt = DateTimeOffset.UtcNow });
                    await db.SaveChangesAsync(ct);
                    break;
                }

            default:
                throw new InvalidOperationException($"Unhandled entity type: {entityName}");
        }
    }

    private static async Task AssertOnlyFleetAVisibleAsync(
        TaxiDbContext db, string entityName, Guid fleetAId, Guid fleetBId, CancellationToken ct)
    {
        switch (entityName)
        {
            case nameof(Driver):
                {
                    var rows = await db.Drivers.AsNoTracking().ToListAsync(ct);
                    rows.Should().NotBeEmpty("seeded at least one driver for fleet A");
                    rows.Should().NotContain(r => r.FleetId == fleetBId);
                    break;
                }
            case nameof(Vehicle):
                {
                    var rows = await db.Vehicles.AsNoTracking().ToListAsync(ct);
                    rows.Should().NotBeEmpty("seeded at least one vehicle for fleet A");
                    rows.Should().NotContain(r => r.FleetId == fleetBId);
                    break;
                }
            case nameof(DriverShift):
                {
                    var rows = await db.DriverShifts.AsNoTracking().ToListAsync(ct);
                    rows.Should().NotBeEmpty("seeded at least one shift for fleet A");
                    rows.Should().NotContain(r => r.FleetId == fleetBId);
                    break;
                }
            case nameof(Order):
                {
                    var rows = await db.Orders.AsNoTracking().ToListAsync(ct);
                    rows.Should().NotBeEmpty("seeded at least one order for fleet A");
                    rows.Should().NotContain(r => r.FleetId == fleetBId);
                    break;
                }
            case nameof(OrderEvent):
                {
                    var rows = await db.OrderEvents.AsNoTracking().ToListAsync(ct);
                    rows.Should().NotBeEmpty("seeded at least one event for fleet A");
                    rows.Should().NotContain(r => r.FleetId == fleetBId);
                    break;
                }
            case nameof(RouteEntity):
                {
                    var rows = await db.Routes.AsNoTracking().ToListAsync(ct);
                    rows.Should().NotBeEmpty("seeded at least one route for fleet A");
                    rows.Should().NotContain(r => r.FleetId == fleetBId);
                    break;
                }
            case nameof(Zone):
                {
                    var rows = await db.Zones.AsNoTracking().ToListAsync(ct);
                    rows.Should().NotBeEmpty("seeded at least one zone for fleet A");
                    rows.Should().NotContain(r => r.FleetId == fleetBId);
                    break;
                }
            case nameof(Tariff):
                {
                    var rows = await db.Tariffs.AsNoTracking().ToListAsync(ct);
                    rows.Should().NotBeEmpty("seeded at least one tariff for fleet A");
                    rows.Should().NotContain(r => r.FleetId == fleetBId);
                    break;
                }
            case nameof(FleetSettings):
                {
                    var rows = await db.FleetSettings.AsNoTracking().ToListAsync(ct);
                    rows.Should().NotBeEmpty("seeded fleet settings for fleet A");
                    rows.Should().NotContain(r => r.FleetId == fleetBId);
                    break;
                }
            case nameof(AuditLog):
                {
                    var rows = await db.AuditLogs.AsNoTracking().ToListAsync(ct);
                    rows.Should().NotBeEmpty("seeded at least one audit log for fleet A");
                    rows.Should().NotContain(r => r.FleetId == fleetBId);
                    break;
                }
            case nameof(User):
                {
                    // Staff users with fleetAId should be visible; fleet B staff should not
                    var rows = await db.Users.AsNoTracking().ToListAsync(ct);
                    rows.Should().NotBeEmpty("seeded at least one staff user for fleet A");
                    rows.Should().NotContain(r => r.FleetId == fleetBId);
                    break;
                }
            case nameof(PushSubscription):
                {
                    // PushSubscriptions with fleetAId should be visible; fleet B should not
                    var rows = await db.PushSubscriptions.AsNoTracking().ToListAsync(ct);
                    rows.Should().NotBeEmpty("seeded at least one push subscription for fleet A");
                    rows.Should().NotContain(r => r.FleetId == fleetBId);
                    break;
                }
            default:
                throw new InvalidOperationException($"Unhandled entity type: {entityName}");
        }
    }

    /// <summary>MemberData source for all 12 tenant-filtered entity types.</summary>
    public static TheoryData<string> TenantEntityNames =>
    [
        nameof(Driver),
        nameof(Vehicle),
        nameof(DriverShift),
        nameof(Order),
        nameof(OrderEvent),
        nameof(RouteEntity),
        nameof(Zone),
        nameof(Tariff),
        nameof(FleetSettings),
        nameof(AuditLog),
        nameof(User),
        nameof(PushSubscription),
    ];

    // ─────────────────────────────────────────────────────────────────────────
    // Test 2 — SaveChanges throws when FleetId mismatches current tenant
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>Verifies that attempting to save an entity with a FleetId that does not match
    /// the current tenant throws an <see cref="InvalidOperationException"/>.</summary>
    [Fact]
    public async Task Tenancy_SaveChanges_ThrowsOnFleetIdMismatch()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.CreateVersion7().ToString("N")[..8];

        Guid fleetAId, fleetBId;
        await using (CreateRawScope(fixture, out var db))
        {
            var fleetA = BuildFleet($"mismatch-a-{suffix}");
            var fleetB = BuildFleet($"mismatch-b-{suffix}");
            db.Fleets.AddRange(fleetA, fleetB);
            await db.SaveChangesAsync(ct);
            fleetAId = fleetA.Id;
            fleetBId = fleetB.Id;
        }

        // Attempt to save a Vehicle belonging to fleet B while the tenant is fleet A
        await using (CreateTenantScope(fixture, fleetAId, out var db))
        {
            var wrongVehicle = BuildVehicle(fleetBId, $"MX{suffix[..4]}");
            db.Vehicles.Add(wrongVehicle);
            var act = async () => await db.SaveChangesAsync(ct);
            await act.Should().ThrowAsync<InvalidOperationException>()
                .WithMessage("*FleetId*");
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 2b — SaveChanges auto-stamps FleetId=Guid.Empty on Added ITenantEntity
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>Verifies that the SaveChanges guard auto-stamps <c>FleetId</c> on an added
    /// <see cref="ITenantEntity"/> whose <c>FleetId</c> is left at <c>Guid.Empty</c>.</summary>
    [Fact]
    public async Task Tenancy_SaveChanges_AutoStampsFleetIdOnDefaultEntity()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.CreateVersion7().ToString("N")[..8];

        Guid fleetAId;
        await using (CreateRawScope(fixture, out var db))
        {
            var fleetA = BuildFleet($"stamp-{suffix}");
            db.Fleets.Add(fleetA);
            await db.SaveChangesAsync(ct);
            fleetAId = fleetA.Id;
        }

        Guid vehicleId;
        await using (CreateTenantScope(fixture, fleetAId, out var db))
        {
            // FleetId intentionally left at Guid.Empty — guard should auto-stamp it.
            var vehicle = new Vehicle
            {
                Id = Guid.CreateVersion7(),
                FleetId = Guid.Empty,
                Plate = $"ST{suffix[..4]}",
                Make = "Toyota",
                Model = "Camry",
                Color = "Blue",
                Seats = 4,
                IsActive = true
            };
            db.Vehicles.Add(vehicle);
            await db.SaveChangesAsync(ct);
            vehicleId = vehicle.Id;

            // Entity is tracked — FleetId must already be stamped in-memory.
            vehicle.FleetId.Should().Be(fleetAId, "SaveChanges must auto-stamp FleetId from current tenant");
        }

        // Confirm persisted value via a fresh scope with IgnoreQueryFilters to bypass the filter.
        await using (CreateTenantScope(fixture, fleetAId, out var db))
        {
            var persisted = await db.Vehicles
                .AsNoTracking()
                .IgnoreQueryFilters()
                .FirstOrDefaultAsync(v => v.Id == vehicleId, ct);

            persisted.Should().NotBeNull("vehicle must have been persisted");
            persisted!.FleetId.Should().Be(fleetAId, "persisted FleetId must equal the current tenant");
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 3 — Nullable FleetId: customer rows visible to both tenants
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>Verifies that <see cref="User"/> rows with a null FleetId (customers/superadmin)
    /// and <see cref="PushSubscription"/> rows with a null FleetId are visible to any tenant.</summary>
    [Fact]
    public async Task Tenancy_NullableFleetIdEntity_CustomerRowsVisibleAcrossTenants()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.CreateVersion7().ToString("N")[..8];

        Guid fleetAId, fleetBId, customerUserId, pushSubId;
        await using (CreateRawScope(fixture, out var db))
        {
            var fleetA = BuildFleet($"null-a-{suffix}");
            var fleetB = BuildFleet($"null-b-{suffix}");
            db.Fleets.AddRange(fleetA, fleetB);
            await db.SaveChangesAsync(ct);
            fleetAId = fleetA.Id;
            fleetBId = fleetB.Id;

            // Customer with null FleetId
            var customer = new User
            {
                Id = Guid.CreateVersion7(),
                FleetId = null,
                Role = UserRole.Customer,
                Phone = $"+420779{suffix[..7]}",
                DisplayName = "Customer Null Fleet",
                IsActive = true,
                CreatedAt = DateTimeOffset.UtcNow
            };
            db.Users.Add(customer);
            await db.SaveChangesAsync(ct);
            customerUserId = customer.Id;

            // PushSubscription with null FleetId
            var pushSub = new PushSubscription
            {
                Id = Guid.CreateVersion7(),
                FleetId = null,
                UserId = customer.Id,
                Endpoint = $"https://push.test/null/{suffix}",
                P256dh = "dGVzdA==",
                Auth = "dGVzdA==",
                CreatedAt = DateTimeOffset.UtcNow
            };
            db.PushSubscriptions.Add(pushSub);
            await db.SaveChangesAsync(ct);
            pushSubId = pushSub.Id;
        }

        // Fleet A should see the null-FleetId customer and push subscription
        await using (CreateTenantScope(fixture, fleetAId, out var db))
        {
            var users = await db.Users.AsNoTracking().Where(u => u.Id == customerUserId).ToListAsync(ct);
            users.Should().HaveCount(1, "Customer with null FleetId must be visible to fleet A");

            var pushSubs = await db.PushSubscriptions.AsNoTracking().Where(p => p.Id == pushSubId).ToListAsync(ct);
            pushSubs.Should().HaveCount(1, "PushSubscription with null FleetId must be visible to fleet A");
        }

        // Fleet B should also see the same null-FleetId rows
        await using (CreateTenantScope(fixture, fleetBId, out var db))
        {
            var users = await db.Users.AsNoTracking().Where(u => u.Id == customerUserId).ToListAsync(ct);
            users.Should().HaveCount(1, "Customer with null FleetId must be visible to fleet B");

            var pushSubs = await db.PushSubscriptions.AsNoTracking().Where(p => p.Id == pushSubId).ToListAsync(ct);
            pushSubs.Should().HaveCount(1, "PushSubscription with null FleetId must be visible to fleet B");
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 2c — SaveChanges throws when a Modified entity's FleetId is reassigned
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>Verifies that modifying a tracked entity's FleetId to a different fleet's value
    /// while operating under the original fleet's tenant throws an
    /// <see cref="InvalidOperationException"/>. Prevents cross-tenant row migration.</summary>
    [Fact]
    public async Task Tenancy_SaveChanges_ThrowsOnModifiedFleetIdReassignment()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.CreateVersion7().ToString("N")[..8];

        Guid fleetAId, fleetBId, vehicleId;
        await using (CreateRawScope(fixture, out var db))
        {
            var fleetA = BuildFleet($"mod-a-{suffix}");
            var fleetB = BuildFleet($"mod-b-{suffix}");
            db.Fleets.AddRange(fleetA, fleetB);
            await db.SaveChangesAsync(ct);
            fleetAId = fleetA.Id;
            fleetBId = fleetB.Id;
        }

        // Seed a vehicle in fleet A using a raw (no-tenant) scope so no filter interferes.
        await using (CreateRawScope(fixture, out var db))
        {
            var vehicle = BuildVehicle(fleetAId, $"MD{suffix[..4]}");
            db.Vehicles.Add(vehicle);
            await db.SaveChangesAsync(ct);
            vehicleId = vehicle.Id;
        }

        // Now open a fleet-A tenant scope and attempt to reassign the vehicle to fleet B.
        await using (CreateTenantScope(fixture, fleetAId, out var db))
        {
            // Load tracked (no AsNoTracking) so EF will detect the state as Modified.
            var vehicle = await db.Vehicles.IgnoreQueryFilters()
                .FirstAsync(v => v.Id == vehicleId, ct);

            // Reassign to fleet B — this must be blocked by the SaveChanges guard.
            vehicle.FleetId = fleetBId;

            var act = async () => await db.SaveChangesAsync(ct);
            await act.Should().ThrowAsync<InvalidOperationException>()
                .WithMessage("*FleetId*");
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test F2 — QueryFilter: null tenant returns zero rows for strict entities
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>Proves fail-closed behaviour: under a null current tenant the strict
    /// <see cref="Order"/> query filter resolves to a never-true predicate, so the table
    /// returns zero rows even when rows are physically present.</summary>
    [Fact]
    public async Task Tenancy_QueryFilter_NullTenant_StrictEntityReturnsZeroRows()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.CreateVersion7().ToString("N")[..8];

        Guid fleetId, orderId;
        await using (CreateRawScope(fixture, out var db))
        {
            var fleet = BuildFleet($"fc-{suffix}");
            db.Fleets.Add(fleet);
            await db.SaveChangesAsync(ct);
            fleetId = fleet.Id;

            var order = BuildOrder(fleetId, $"FC{suffix[..4]}");
            db.Orders.Add(order);
            await db.SaveChangesAsync(ct);
            orderId = order.Id;
        }

        // Confirm the row physically exists (bypass filters).
        await using (CreateRawScope(fixture, out var db))
        {
            var count = await db.Orders.IgnoreQueryFilters()
                .CountAsync(o => o.Id == orderId, ct);
            count.Should().Be(1, "the order was seeded and must exist in the database");
        }

        // Open a null-tenant scope and confirm the filter excludes ALL rows.
        await using (CreateRawScope(fixture, out var db))
        {
            // No tenant set — the filter is: FleetId == null (never true for Order)
            var rows = await db.Orders.AsNoTracking().Where(o => o.Id == orderId).ToListAsync(ct);
            rows.Should().BeEmpty("strict-filter entity must return zero rows under a null tenant (fail-closed)");
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 4 — Middleware: JWT claim > X-Fleet-Slug header > subdomain
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>Unit-tests the <see cref="TenantResolutionMiddleware"/> precedence in isolation,
    /// using a real <see cref="TaxiDbContext"/> scope for slug lookups. No probe endpoint needed —
    /// the middleware is exercised directly with a constructed HttpContext.
    /// WI-08 CreateOrder will provide the full integration proof of header-based resolution.</summary>
    [Fact]
    public async Task Tenancy_Resolution_PrefersJwtClaimThenHeaderThenSubdomain()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.CreateVersion7().ToString("N")[..8];

        // Seed fleets to enable slug lookups.
        // BuildFleet prefixes "fleet-" so slugs become "fleet-jwt-{suffix}", etc.
        Guid fleetJwtId, fleetHeaderId, fleetSubdomainId;
        string slugJwt, slugHeader, slugSub;
        await using (CreateRawScope(fixture, out var db))
        {
            var fJwt = BuildFleet($"jwt-{suffix}");
            var fHeader = BuildFleet($"hdr-{suffix}");
            var fSub = BuildFleet($"sub-{suffix}");
            db.Fleets.AddRange(fJwt, fHeader, fSub);
            await db.SaveChangesAsync(ct);
            fleetJwtId = fJwt.Id;
            fleetHeaderId = fHeader.Id;
            fleetSubdomainId = fSub.Id;
            slugJwt = fJwt.Slug;
            slugHeader = fHeader.Slug;
            slugSub = fSub.Slug;
        }

        // ── Case 1: JWT claim wins over header and subdomain ─────────────────
        await using (var scope1 = fixture.Factory.Services.CreateAsyncScope())
        {
            var tenant = scope1.ServiceProvider.GetRequiredService<CurrentTenant>();
            var db = scope1.ServiceProvider.GetRequiredService<TaxiDbContext>();
            var middleware = new TenantResolutionMiddleware(_ => Task.CompletedTask);

            var ctx = BuildHttpContext(
                jwtFleetId: fleetJwtId,
                xFleetSlugHeader: slugHeader,
                host: $"{slugSub}.api.test");

            await middleware.InvokeAsync(ctx, tenant, db);
            tenant.FleetId.Should().Be(fleetJwtId, "JWT claim should win over header and subdomain");
        }

        // ── Case 2: Header wins over subdomain when no JWT claim ─────────────
        await using (var scope2 = fixture.Factory.Services.CreateAsyncScope())
        {
            var tenant = scope2.ServiceProvider.GetRequiredService<CurrentTenant>();
            var db = scope2.ServiceProvider.GetRequiredService<TaxiDbContext>();
            var middleware = new TenantResolutionMiddleware(_ => Task.CompletedTask);

            var ctx = BuildHttpContext(
                jwtFleetId: null,
                xFleetSlugHeader: slugHeader,
                host: $"{slugSub}.api.test");

            await middleware.InvokeAsync(ctx, tenant, db);
            tenant.FleetId.Should().Be(fleetHeaderId, "X-Fleet-Slug header should win over subdomain");
        }

        // ── Case 3: Subdomain alone ──────────────────────────────────────────
        await using (var scope3 = fixture.Factory.Services.CreateAsyncScope())
        {
            var tenant = scope3.ServiceProvider.GetRequiredService<CurrentTenant>();
            var db = scope3.ServiceProvider.GetRequiredService<TaxiDbContext>();
            var middleware = new TenantResolutionMiddleware(_ => Task.CompletedTask);

            var ctx = BuildHttpContext(
                jwtFleetId: null,
                xFleetSlugHeader: null,
                host: $"{slugSub}.api.test");

            await middleware.InvokeAsync(ctx, tenant, db);
            tenant.FleetId.Should().Be(fleetSubdomainId, "Subdomain should resolve the tenant");
        }

        // ── Case 4: Unknown slug → null tenant ───────────────────────────────
        await using (var scope4 = fixture.Factory.Services.CreateAsyncScope())
        {
            var tenant = scope4.ServiceProvider.GetRequiredService<CurrentTenant>();
            var db = scope4.ServiceProvider.GetRequiredService<TaxiDbContext>();
            var middleware = new TenantResolutionMiddleware(_ => Task.CompletedTask);

            var ctx = BuildHttpContext(
                jwtFleetId: null,
                xFleetSlugHeader: "no-such-fleet-xyz",
                host: "localhost");

            await middleware.InvokeAsync(ctx, tenant, db);
            tenant.FleetId.Should().BeNull("Unknown slug must leave tenant null");
        }
    }

    private static DefaultHttpContext BuildHttpContext(
        Guid? jwtFleetId,
        string? xFleetSlugHeader,
        string? host)
    {
        var ctx = new DefaultHttpContext();

        if (jwtFleetId.HasValue)
        {
            ctx.User = new ClaimsPrincipal(new ClaimsIdentity(
            [
                new Claim(TenantClaims.FleetId, jwtFleetId.Value.ToString())
            ], "TestScheme"));
        }
        else
        {
            ctx.User = new ClaimsPrincipal(new ClaimsIdentity());
        }

        if (xFleetSlugHeader is not null)
        {
            ctx.Request.Headers["X-Fleet-Slug"] = xFleetSlugHeader;
        }

        if (host is not null)
        {
            ctx.Request.Host = new HostString(host);
        }

        return ctx;
    }
}

using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Common;
using Taxi.Api.Common.Orders;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Drivers;

/// <summary>Integration and unit tests for driver/vehicle endpoints (WI-11).</summary>
[Collection(TestCollections.Database)]
public sealed class DriverVehicleTests(PostgresFixture fixture)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        Converters = { new System.Text.Json.Serialization.JsonStringEnumConverter() }
    };

    // ── Fake time constant (from TaxiApiFactory) ──────────────────────────────
    private static readonly DateTimeOffset FakeNow = new(2026, 9, 10, 12, 0, 0, TimeSpan.Zero);

    // ── Seed helpers ──────────────────────────────────────────────────────────

    private static Fleet BuildFleet(string slugSuffix) => new()
    {
        Id = Guid.CreateVersion7(),
        Slug = $"drv-{slugSuffix}",
        Name = $"Driver Test Fleet {slugSuffix}",
        Phone = "+420600900001",
        Currency = "CZK",
        TimeZone = "Europe/Prague",
        IsActive = true,
        CreatedAt = DateTimeOffset.UtcNow
    };

    private static User BuildDriverUser(Guid fleetId, string phoneSuffix) => new()
    {
        Id = Guid.CreateVersion7(),
        FleetId = fleetId,
        Role = UserRole.Driver,
        Phone = $"+420810{phoneSuffix}",
        DisplayName = "Test Driver",
        IsActive = true,
        CreatedAt = DateTimeOffset.UtcNow
    };

    private static User BuildDispatcherUser(Guid fleetId, string phoneSuffix) => new()
    {
        Id = Guid.CreateVersion7(),
        FleetId = fleetId,
        Role = UserRole.Dispatcher,
        Phone = $"+420820{phoneSuffix}",
        DisplayName = "Test Dispatcher",
        IsActive = true,
        CreatedAt = DateTimeOffset.UtcNow
    };

    private static Driver BuildDriver(Guid fleetId, Guid userId, DriverStatus status = DriverStatus.Offline) => new()
    {
        Id = Guid.CreateVersion7(),
        FleetId = fleetId,
        UserId = userId,
        Status = status,
        IsActive = true
    };

    private static Vehicle BuildVehicle(Guid fleetId, string plate, bool isActive = true) => new()
    {
        Id = Guid.CreateVersion7(),
        FleetId = fleetId,
        Plate = plate,
        Make = "Skoda",
        Model = "Octavia",
        Color = "White",
        Seats = 4,
        IsActive = isActive
    };

    private static User BuildFleetAdminUser(Guid fleetId, string phoneSuffix) => new()
    {
        Id = Guid.CreateVersion7(),
        FleetId = fleetId,
        Role = UserRole.FleetAdmin,
        Phone = $"+420830{phoneSuffix}",
        DisplayName = "Fleet Admin",
        IsActive = true,
        CreatedAt = DateTimeOffset.UtcNow
    };

    private async Task SeedAsync(params object[] entities)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        // Use null tenant scope for seeding
        var currentTenant = scope.ServiceProvider.GetRequiredService<CurrentTenant>();
        currentTenant.FleetId = null;

        db.AddRange(entities);
        await db.SaveChangesAsync(TestContext.Current.CancellationToken);
    }

    // ── GoOnline tests ────────────────────────────────────────────────────────

    /// <summary>Going online with a valid vehicle opens a shift and sets status to Free.</summary>
    [Fact]
    public async Task GoOnline_ValidVehicle_OpensShiftAndSetsFree()
    {
        var fleet = BuildFleet("goonline-happy");
        var driverUser = BuildDriverUser(fleet.Id, "001001");
        var driver = BuildDriver(fleet.Id, driverUser.Id, DriverStatus.Offline);
        var vehicle = BuildVehicle(fleet.Id, "1AB2345");
        await SeedAsync(fleet, driverUser, driver, vehicle);

        var client = fixture.Factory.CreateClient();
        client.AsDriver(fleet.Id, driverUser.Id);

        var response = await client.PostAsJsonAsync(
            "api/v1/drivers/me/online",
            new { vehicleId = vehicle.Id },
            TestContext.Current.CancellationToken);

        response.StatusCode.Should().Be(HttpStatusCode.NoContent);

        // Assert DB state
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var currentTenant = scope.ServiceProvider.GetRequiredService<CurrentTenant>();
        currentTenant.FleetId = null;

        var updatedDriver = await db.Drivers.IgnoreQueryFilters()
            .FirstOrDefaultAsync(d => d.Id == driver.Id, TestContext.Current.CancellationToken);
        updatedDriver.Should().NotBeNull();
        updatedDriver!.Status.Should().Be(DriverStatus.Free);
        updatedDriver.CurrentVehicleId.Should().Be(vehicle.Id);

        var shift = await db.DriverShifts.IgnoreQueryFilters()
            .FirstOrDefaultAsync(s => s.DriverId == driver.Id && s.EndedAt == null,
                TestContext.Current.CancellationToken);
        shift.Should().NotBeNull();
        shift!.VehicleId.Should().Be(vehicle.Id);
        shift.StartedAt.Should().Be(FakeNow);
        shift.EndedAt.Should().BeNull();
    }

    /// <summary>Going online when already online returns 409 with the correct error code in the body.</summary>
    [Fact]
    public async Task GoOnline_AlreadyOnline_Returns409()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleet = BuildFleet("goonline-conflict");
        var driverUser = BuildDriverUser(fleet.Id, "002001");
        var vehicle = BuildVehicle(fleet.Id, "2AB2345");
        var driver = BuildDriver(fleet.Id, driverUser.Id, DriverStatus.Free);
        driver.CurrentVehicleId = vehicle.Id;
        await SeedAsync(fleet, driverUser, driver, vehicle);

        var client = fixture.Factory.CreateClient();
        client.AsDriver(fleet.Id, driverUser.Id);

        var response = await client.PostAsJsonAsync(
            "api/v1/drivers/me/online",
            new { vehicleId = vehicle.Id },
            ct);

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);

        // Verify the body contains the correct human-readable message AND machine-readable error code.
        // Regression guard: if AddError(message, code) args are inverted, 'reason' == code string and 'code' == message.
        var body = await response.Content.ReadFromJsonAsync<JsonElement>(JsonOptions, ct);
        var firstError = body.GetProperty("errors").EnumerateArray().First();
        firstError.GetProperty("reason").GetString().Should().Be("Driver is already online.");
        firstError.GetProperty("code").GetString().Should().Be(ErrorCodes.Driver.AlreadyOnline);
    }

    /// <summary>Going online with a vehicle from another fleet returns 404 (no-leak).</summary>
    [Fact]
    public async Task GoOnline_CrossTenantVehicle_Returns404()
    {
        var fleetA = BuildFleet("goonline-xtenant-a");
        var fleetB = BuildFleet("goonline-xtenant-b");
        var driverUser = BuildDriverUser(fleetA.Id, "003001");
        var driver = BuildDriver(fleetA.Id, driverUser.Id, DriverStatus.Offline);
        var vehicleB = BuildVehicle(fleetB.Id, "3AB2345"); // belongs to fleet B
        await SeedAsync(fleetA, fleetB, driverUser, driver, vehicleB);

        var client = fixture.Factory.CreateClient();
        client.AsDriver(fleetA.Id, driverUser.Id);

        var response = await client.PostAsJsonAsync(
            "api/v1/drivers/me/online",
            new { vehicleId = vehicleB.Id },
            TestContext.Current.CancellationToken);

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    // ── GoOffline tests ───────────────────────────────────────────────────────

    /// <summary>Going offline closes the open shift and sets status to Offline.</summary>
    [Fact]
    public async Task GoOffline_ClosesShiftAndSetsOffline()
    {
        var fleet = BuildFleet("gooffline-happy");
        var driverUser = BuildDriverUser(fleet.Id, "004001");
        var vehicle = BuildVehicle(fleet.Id, "4AB2345");
        var driver = BuildDriver(fleet.Id, driverUser.Id, DriverStatus.Free);
        driver.CurrentVehicleId = vehicle.Id;
        var shift = new DriverShift
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            DriverId = driver.Id,
            VehicleId = vehicle.Id,
            StartedAt = FakeNow.AddHours(-1),
            EndedAt = null
        };
        await SeedAsync(fleet, driverUser, driver, vehicle, shift);

        var client = fixture.Factory.CreateClient();
        client.AsDriver(fleet.Id, driverUser.Id);

        var response = await client.PostAsync(
            "api/v1/drivers/me/offline",
            null,
            TestContext.Current.CancellationToken);

        response.StatusCode.Should().Be(HttpStatusCode.NoContent);

        // Assert DB state
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var currentTenant = scope.ServiceProvider.GetRequiredService<CurrentTenant>();
        currentTenant.FleetId = null;

        var updatedDriver = await db.Drivers.IgnoreQueryFilters()
            .FirstOrDefaultAsync(d => d.Id == driver.Id, TestContext.Current.CancellationToken);
        updatedDriver!.Status.Should().Be(DriverStatus.Offline);
        updatedDriver.CurrentVehicleId.Should().BeNull();

        var updatedShift = await db.DriverShifts.IgnoreQueryFilters()
            .FirstOrDefaultAsync(s => s.Id == shift.Id, TestContext.Current.CancellationToken);
        updatedShift!.EndedAt.Should().Be(FakeNow);
    }

    /// <summary>Going offline when EnRoute (active ride via OrderService accept) returns 409.</summary>
    [Fact]
    public async Task GoOffline_WithActiveRide_Returns409()
    {
        var ct = TestContext.Current.CancellationToken;

        var fleet = BuildFleet("gooffline-active");
        var dispatcherUser = BuildDispatcherUser(fleet.Id, "005002");
        var driverUser = BuildDriverUser(fleet.Id, "005001");
        var vehicle = BuildVehicle(fleet.Id, "5AB2345");
        var driver = BuildDriver(fleet.Id, driverUser.Id, DriverStatus.Free);
        driver.CurrentVehicleId = vehicle.Id;

        // Build a New order to transition through.
        var order = new Order
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            PublicCode = "ACTV01",
            Status = OrderStatus.New,
            Source = OrderSource.Dispatcher,
            CustomerPhone = "+420600000005",
            PickupAddress = "Test St 1",
            PickupLat = 50.0,
            PickupLng = 14.0,
            PriceType = PriceType.Estimate,
            CreatedAt = FakeNow,
            UpdatedAt = FakeNow,
            Version = 1
        };
        await SeedAsync(fleet, dispatcherUser, driverUser, driver, vehicle, order);

        // Use OrderService to Assign and then Accept — this drives the driver to EnRoute status.
        using var svcScope = fixture.Factory.Services.CreateScope();
        var tenant = svcScope.ServiceProvider.GetRequiredService<CurrentTenant>();
        tenant.FleetId = fleet.Id;
        var svc = svcScope.ServiceProvider.GetRequiredService<OrderService>();

        var assignResult = await svc.TransitionAsync(
            order.Id,
            OrderTransition.Assign,
            new Actor(dispatcherUser.Id, UserRole.Dispatcher),
            new AssignPayload(driver.Id, vehicle.Id),
            ct);
        assignResult.IsSuccess.Should().BeTrue("Assign must succeed before testing GoOffline");

        var acceptResult = await svc.TransitionAsync(
            order.Id,
            OrderTransition.Accept,
            new Actor(driverUser.Id, UserRole.Driver, driver.Id),
            null,
            ct);
        acceptResult.IsSuccess.Should().BeTrue("Accept must succeed to set driver to EnRoute");

        // Now try to go offline — driver is EnRoute, so expect 409.
        var client = fixture.Factory.CreateClient();
        client.AsDriver(fleet.Id, driverUser.Id);

        var response = await client.PostAsync(
            "api/v1/drivers/me/offline",
            null,
            ct);

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    /// <summary>Going offline when already offline returns 409.</summary>
    [Fact]
    public async Task GoOffline_AlreadyOffline_Returns409()
    {
        var fleet = BuildFleet("gooffline-conflict");
        var driverUser = BuildDriverUser(fleet.Id, "006001");
        var driver = BuildDriver(fleet.Id, driverUser.Id, DriverStatus.Offline);
        await SeedAsync(fleet, driverUser, driver);

        var client = fixture.Factory.CreateClient();
        client.AsDriver(fleet.Id, driverUser.Id);

        var response = await client.PostAsync(
            "api/v1/drivers/me/offline",
            null,
            TestContext.Current.CancellationToken);

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    // ── GetMe tests ───────────────────────────────────────────────────────────

    /// <summary>GET /drivers/me returns the driver's own row.</summary>
    [Fact]
    public async Task GetMe_ReturnsOwnDriverRow()
    {
        var fleet = BuildFleet("getme-happy");
        var driverUser = BuildDriverUser(fleet.Id, "007001");
        var vehicle = BuildVehicle(fleet.Id, "7AB2345");
        var driver = BuildDriver(fleet.Id, driverUser.Id, DriverStatus.Free);
        driver.CurrentVehicleId = vehicle.Id;
        var shift = new DriverShift
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            DriverId = driver.Id,
            VehicleId = vehicle.Id,
            StartedAt = FakeNow.AddHours(-1),
            EndedAt = null
        };
        await SeedAsync(fleet, driverUser, driver, vehicle, shift);

        var client = fixture.Factory.CreateClient();
        client.AsDriver(fleet.Id, driverUser.Id);

        var response = await client.GetAsync(
            "api/v1/drivers/me",
            TestContext.Current.CancellationToken);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>(
            JsonOptions, TestContext.Current.CancellationToken);
        body.GetProperty("driverId").GetGuid().Should().Be(driver.Id);
        body.GetProperty("status").GetString().Should().Be("Free");
    }

    // ── ListDrivers tests ─────────────────────────────────────────────────────

    /// <summary>Dispatcher of fleet B cannot see fleet A drivers (tenant isolation).</summary>
    [Fact]
    public async Task ListDrivers_DispatcherOfFleetB_CannotSeeFleetADrivers()
    {
        var fleetA = BuildFleet("listdrv-isolation-a");
        var fleetB = BuildFleet("listdrv-isolation-b");
        var driverUserA = BuildDriverUser(fleetA.Id, "008001");
        var dispatcherUserB = BuildDispatcherUser(fleetB.Id, "008002");
        var driverA = BuildDriver(fleetA.Id, driverUserA.Id);
        await SeedAsync(fleetA, fleetB, driverUserA, dispatcherUserB, driverA);

        var client = fixture.Factory.CreateClient();
        client.AsDispatcher(fleetB.Id);

        var response = await client.GetAsync(
            "api/v1/drivers",
            TestContext.Current.CancellationToken);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>(
            JsonOptions, TestContext.Current.CancellationToken);
        var items = body.GetProperty("items").EnumerateArray().ToList();
        items.Should().NotContain(e => e.GetProperty("driverId").GetGuid() == driverA.Id);
    }

    /// <summary>A driver calling ListDrivers gets 403 (Dispatcher-only).</summary>
    [Fact]
    public async Task ListDrivers_Driver_Returns403()
    {
        var fleet = BuildFleet("listdrv-driver-403");
        var driverUser = BuildDriverUser(fleet.Id, "009001");
        var driver = BuildDriver(fleet.Id, driverUser.Id);
        await SeedAsync(fleet, driverUser, driver);

        var client = fixture.Factory.CreateClient();
        client.AsDriver(fleet.Id, driverUser.Id);

        var response = await client.GetAsync(
            "api/v1/drivers",
            TestContext.Current.CancellationToken);

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    // ── Vehicle CRUD tests ────────────────────────────────────────────────────

    /// <summary>FleetAdmin can list vehicles.</summary>
    [Fact]
    public async Task ListVehicles_FleetAdmin_Returns200()
    {
        var fleet = BuildFleet("vehicles-list");
        var adminUser = BuildFleetAdminUser(fleet.Id, "010001");
        var vehicle = BuildVehicle(fleet.Id, "ABA0001");
        await SeedAsync(fleet, adminUser, vehicle);

        var client = fixture.Factory.CreateClient();
        client.AsFleetAdmin(fleet.Id, adminUser.Id);

        var response = await client.GetAsync(
            "api/v1/vehicles",
            TestContext.Current.CancellationToken);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>(
            JsonOptions, TestContext.Current.CancellationToken);
        var items = body.GetProperty("items").EnumerateArray().ToList();
        items.Should().Contain(e => e.GetProperty("id").GetGuid() == vehicle.Id);
    }

    /// <summary>FleetAdmin can get a single vehicle.</summary>
    [Fact]
    public async Task GetVehicle_FleetAdmin_Returns200()
    {
        var fleet = BuildFleet("vehicles-get");
        var adminUser = BuildFleetAdminUser(fleet.Id, "011001");
        var vehicle = BuildVehicle(fleet.Id, "ABB0001");
        await SeedAsync(fleet, adminUser, vehicle);

        var client = fixture.Factory.CreateClient();
        client.AsFleetAdmin(fleet.Id, adminUser.Id);

        var response = await client.GetAsync(
            $"api/v1/vehicles/{vehicle.Id}",
            TestContext.Current.CancellationToken);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>(
            JsonOptions, TestContext.Current.CancellationToken);
        body.GetProperty("id").GetGuid().Should().Be(vehicle.Id);
        body.GetProperty("plate").GetString().Should().Be("ABB0001");
    }

    /// <summary>FleetAdmin can create a vehicle.</summary>
    [Fact]
    public async Task CreateVehicle_FleetAdmin_Returns201()
    {
        var fleet = BuildFleet("vehicles-create");
        var adminUser = BuildFleetAdminUser(fleet.Id, "012001");
        await SeedAsync(fleet, adminUser);

        var client = fixture.Factory.CreateClient();
        client.AsFleetAdmin(fleet.Id, adminUser.Id);

        var response = await client.PostAsJsonAsync(
            "api/v1/vehicles",
            new { plate = "NEWV001", make = "Toyota", model = "Camry", color = "Black", seats = 4 },
            TestContext.Current.CancellationToken);

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>(
            JsonOptions, TestContext.Current.CancellationToken);
        body.GetProperty("plate").GetString().Should().Be("NEWV001");
        body.GetProperty("id").GetGuid().Should().NotBeEmpty();
    }

    /// <summary>FleetAdmin can update a vehicle.</summary>
    [Fact]
    public async Task UpdateVehicle_FleetAdmin_Returns200()
    {
        var fleet = BuildFleet("vehicles-update");
        var adminUser = BuildFleetAdminUser(fleet.Id, "013001");
        var vehicle = BuildVehicle(fleet.Id, "UPD0001");
        await SeedAsync(fleet, adminUser, vehicle);

        var client = fixture.Factory.CreateClient();
        client.AsFleetAdmin(fleet.Id, adminUser.Id);

        var response = await client.PutAsJsonAsync(
            $"api/v1/vehicles/{vehicle.Id}",
            new { plate = "UPD0002", make = "Toyota", model = "Camry", color = "Blue", seats = 5 },
            TestContext.Current.CancellationToken);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>(
            JsonOptions, TestContext.Current.CancellationToken);
        body.GetProperty("plate").GetString().Should().Be("UPD0002");
        body.GetProperty("seats").GetInt32().Should().Be(5);
    }

    /// <summary>FleetAdmin can delete (deactivate) a vehicle.</summary>
    [Fact]
    public async Task DeleteVehicle_FleetAdmin_Returns204()
    {
        var fleet = BuildFleet("vehicles-delete");
        var adminUser = BuildFleetAdminUser(fleet.Id, "014001");
        var vehicle = BuildVehicle(fleet.Id, "DEL0001");
        await SeedAsync(fleet, adminUser, vehicle);

        var client = fixture.Factory.CreateClient();
        client.AsFleetAdmin(fleet.Id, adminUser.Id);

        var response = await client.DeleteAsync(
            $"api/v1/vehicles/{vehicle.Id}",
            TestContext.Current.CancellationToken);

        response.StatusCode.Should().Be(HttpStatusCode.NoContent);

        // Verify IsActive is false
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var ct = scope.ServiceProvider.GetRequiredService<CurrentTenant>();
        ct.FleetId = null;
        var deactivated = await db.Vehicles.IgnoreQueryFilters()
            .FirstOrDefaultAsync(v => v.Id == vehicle.Id, TestContext.Current.CancellationToken);
        deactivated!.IsActive.Should().BeFalse();
    }

    /// <summary>Cross-tenant vehicle lookup returns 404 (no-leak).</summary>
    [Fact]
    public async Task GetVehicle_CrossTenant_Returns404()
    {
        var fleetA = BuildFleet("vehicles-xtenant-a");
        var fleetB = BuildFleet("vehicles-xtenant-b");
        var adminA = BuildFleetAdminUser(fleetA.Id, "015001");
        var vehicleB = BuildVehicle(fleetB.Id, "XTN0001");
        await SeedAsync(fleetA, fleetB, adminA, vehicleB);

        var client = fixture.Factory.CreateClient();
        client.AsFleetAdmin(fleetA.Id, adminA.Id);

        var response = await client.GetAsync(
            $"api/v1/vehicles/{vehicleB.Id}",
            TestContext.Current.CancellationToken);

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    /// <summary>Creating a vehicle with a duplicate plate within the same fleet returns 409.</summary>
    [Fact]
    public async Task CreateVehicle_DuplicatePlate_Returns409()
    {
        var fleet = BuildFleet("vehicles-dupplate");
        var adminUser = BuildFleetAdminUser(fleet.Id, "016001");
        var existing = BuildVehicle(fleet.Id, "DUP0001");
        await SeedAsync(fleet, adminUser, existing);

        var client = fixture.Factory.CreateClient();
        client.AsFleetAdmin(fleet.Id, adminUser.Id);

        var response = await client.PostAsJsonAsync(
            "api/v1/vehicles",
            new { plate = "DUP0001", make = "Ford", model = "Focus", color = "Red", seats = 4 },
            TestContext.Current.CancellationToken);

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    /// <summary>A Dispatcher calling CreateVehicle gets 403 (FleetAdmin only).</summary>
    [Fact]
    public async Task CreateVehicle_Dispatcher_Returns403()
    {
        var fleet = BuildFleet("vehicles-disp-403");
        var dispatcherUser = BuildDispatcherUser(fleet.Id, "017001");
        await SeedAsync(fleet, dispatcherUser);

        var client = fixture.Factory.CreateClient();
        client.AsDispatcher(fleet.Id, dispatcherUser.Id);

        var response = await client.PostAsJsonAsync(
            "api/v1/vehicles",
            new { plate = "DSP0001", make = "Ford", model = "Focus", color = "Red", seats = 4 },
            TestContext.Current.CancellationToken);

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    /// <summary>POSTing a body without the plate key should return 400 (validator), not 500.</summary>
    [Fact]
    public async Task CreateVehicle_MissingPlateInBody_Returns400()
    {
        var fleet = BuildFleet("vehicles-missing-plate");
        var adminUser = BuildFleetAdminUser(fleet.Id, "018001");
        await SeedAsync(fleet, adminUser);

        var client = fixture.Factory.CreateClient();
        client.AsFleetAdmin(fleet.Id, adminUser.Id);

        // Omit the "plate" key entirely — only make/model/color/seats are present.
        var response = await client.PostAsJsonAsync(
            "api/v1/vehicles",
            new { make = "Ford", model = "Focus", color = "Red", seats = 4 },
            TestContext.Current.CancellationToken);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    // ── GoOnline inactive vehicle test ────────────────────────────────────────

    /// <summary>Going online with an inactive vehicle returns 404 (no-leak).</summary>
    [Fact]
    public async Task GoOnline_InactiveVehicle_Returns404()
    {
        var fleet = BuildFleet("goonline-inactive");
        var driverUser = BuildDriverUser(fleet.Id, "019001");
        var driver = BuildDriver(fleet.Id, driverUser.Id, DriverStatus.Offline);
        var inactiveVehicle = BuildVehicle(fleet.Id, "INACT001", isActive: false);
        await SeedAsync(fleet, driverUser, driver, inactiveVehicle);

        var client = fixture.Factory.CreateClient();
        client.AsDriver(fleet.Id, driverUser.Id);

        var response = await client.PostAsJsonAsync(
            "api/v1/drivers/me/online",
            new { vehicleId = inactiveVehicle.Id },
            TestContext.Current.CancellationToken);

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}


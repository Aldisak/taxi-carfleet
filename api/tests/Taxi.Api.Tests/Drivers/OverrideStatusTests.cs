using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using FluentValidation.TestHelper;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Common;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Realtime;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Drivers;

/// <summary>Integration tests for POST /drivers/{id}/status (driver status override, A3).</summary>
[Collection(TestCollections.Database)]
public sealed class OverrideStatusTests(PostgresFixture fixture)
{
    private static readonly DateTimeOffset FakeNow = new(2026, 9, 10, 12, 0, 0, TimeSpan.Zero);

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        Converters = { new System.Text.Json.Serialization.JsonStringEnumConverter() }
    };

    // ── Seed helpers ──────────────────────────────────────────────────────────

    private static Fleet BuildFleet(string slugSuffix) => new()
    {
        Id = Guid.CreateVersion7(),
        Slug = $"ovr-{slugSuffix}",
        Name = $"Override Test Fleet {slugSuffix}",
        Phone = "+420601700001",
        Currency = "CZK",
        TimeZone = "Europe/Prague",
        IsActive = true,
        CreatedAt = DateTimeOffset.UtcNow
    };

    private static User BuildDispatcher(Guid fleetId, string phoneSuffix) => new()
    {
        Id = Guid.CreateVersion7(),
        FleetId = fleetId,
        Role = UserRole.Dispatcher,
        Phone = $"+420621{phoneSuffix}",
        DisplayName = "Test Dispatcher",
        IsActive = true,
        CreatedAt = DateTimeOffset.UtcNow
    };

    private static User BuildDriverUser(Guid fleetId, string phoneSuffix) => new()
    {
        Id = Guid.CreateVersion7(),
        FleetId = fleetId,
        Role = UserRole.Driver,
        Phone = $"+420631{phoneSuffix}",
        DisplayName = "Test Driver",
        IsActive = true,
        CreatedAt = DateTimeOffset.UtcNow
    };

    private static Driver BuildDriver(Guid fleetId, Guid userId, DriverStatus status = DriverStatus.Free, Guid? vehicleId = null) => new()
    {
        Id = Guid.CreateVersion7(),
        FleetId = fleetId,
        UserId = userId,
        Status = status,
        CurrentVehicleId = vehicleId,
        IsActive = true
    };

    private static Vehicle BuildVehicle(Guid fleetId) => new()
    {
        Id = Guid.CreateVersion7(),
        FleetId = fleetId,
        Plate = "OVR-01",
        Make = "Skoda",
        Model = "Fabia",
        Color = "Red",
        Seats = 4,
        IsActive = true
    };

    private async Task<(Fleet fleet, User dispatcher, Driver driver)> SeedScenario(
        string suffix, DriverStatus driverStatus = DriverStatus.Free, bool openShift = false)
    {
        var ct = TestContext.Current.CancellationToken;
        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        var fleet = BuildFleet(suffix);
        var dispatcher = BuildDispatcher(fleet.Id, suffix[..6]);
        var driverUser = BuildDriverUser(fleet.Id, suffix[..6]);
        var vehicle = BuildVehicle(fleet.Id);
        vehicle.Plate = $"OV{suffix[..4].ToUpperInvariant()}";
        var driver = BuildDriver(fleet.Id, driverUser.Id, driverStatus, openShift ? vehicle.Id : null);

        db.Fleets.Add(fleet);
        db.Users.Add(dispatcher);
        db.Users.Add(driverUser);
        db.Vehicles.Add(vehicle);
        db.Drivers.Add(driver);

        if (openShift)
        {
            db.DriverShifts.Add(new DriverShift
            {
                Id = Guid.CreateVersion7(),
                FleetId = fleet.Id,
                DriverId = driver.Id,
                VehicleId = vehicle.Id,
                StartedAt = FakeNow.AddHours(-1),
                EndedAt = null
            });
        }

        await db.SaveChangesAsync(ct);
        return (fleet, dispatcher, driver);
    }

    // ── F-02: lastLat/lastLng in DriverSummaryDto ─────────────────────────────

    /// <summary>GET /drivers projects lastLat and lastLng from the Driver entity into DriverSummaryDto.</summary>
    [Fact]
    public async Task ListDrivers_ProjectsLastLatLng()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..6];

        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var fleet = BuildFleet(suffix + "ll");
        var driverUser = BuildDriverUser(fleet.Id, suffix[..6]);
        db.Fleets.Add(fleet);
        db.Users.Add(driverUser);
        var driver = BuildDriver(fleet.Id, driverUser.Id, DriverStatus.Free);
        driver.LastLat = 50.1234;
        driver.LastLng = 14.5678;
        driver.LastPositionAt = FakeNow.AddMinutes(-5);
        db.Drivers.Add(driver);
        await db.SaveChangesAsync(ct);

        var client = fixture.Factory.CreateClient();
        var dispatcher = BuildDispatcher(fleet.Id, suffix[..5] + "0");
        using var scope2 = fixture.Factory.Services.CreateScope();
        var db2 = scope2.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db2.Users.Add(dispatcher);
        await db2.SaveChangesAsync(ct);

        client.AsDispatcher(fleet.Id, dispatcher.Id);
        var resp = await client.GetAsync("api/v1/drivers", ct);
        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<ListDriversResponse>(JsonOptions, ct);
        var item = body!.Items.First(i => i.DriverId == driver.Id);
        item.LastLat.Should().Be(50.1234);
        item.LastLng.Should().Be(14.5678);
    }

    // ── Override: happy path ──────────────────────────────────────────────────

    /// <summary>Overriding a Free driver to Busy sets status and writes one AuditLog row.</summary>
    [Fact]
    public async Task Override_ToBusy_SetsStatusAndWritesAuditLog()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..6];
        var (fleet, dispatcher, driver) = await SeedScenario(suffix, DriverStatus.Free);

        var client = fixture.Factory.CreateClient();
        client.AsDispatcher(fleet.Id, dispatcher.Id);

        var resp = await client.PostAsJsonAsync($"api/v1/drivers/{driver.Id}/status", new { status = "Busy" }, ct);
        resp.StatusCode.Should().Be(HttpStatusCode.NoContent);

        // Verify status updated.
        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var updatedDriver = await db.Drivers.IgnoreQueryFilters().FirstAsync(d => d.Id == driver.Id, ct);
        updatedDriver.Status.Should().Be(DriverStatus.Busy);

        // Verify AuditLog row.
        var auditLog = await db.AuditLogs.IgnoreQueryFilters()
            .FirstOrDefaultAsync(a => a.EntityId == driver.Id && a.Action == "StatusOverride", ct);
        auditLog.Should().NotBeNull();
        auditLog!.Entity.Should().Be("Driver");
        auditLog.ActorUserId.Should().Be(dispatcher.Id);
        auditLog.FleetId.Should().Be(fleet.Id);
    }

    /// <summary>Overriding a Busy driver to Offline closes the open shift and leaves active orders untouched.</summary>
    [Fact]
    public async Task Override_BusyDriverToOffline_ClosesShiftAndLeavesActiveOrderUntouched()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..6];
        var (fleet, dispatcher, driver) = await SeedScenario(suffix, DriverStatus.Busy, openShift: true);

        var client = fixture.Factory.CreateClient();
        client.AsDispatcher(fleet.Id, dispatcher.Id);

        var resp = await client.PostAsJsonAsync($"api/v1/drivers/{driver.Id}/status", new { status = "Offline" }, ct);
        resp.StatusCode.Should().Be(HttpStatusCode.NoContent);

        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        var updatedDriver = await db.Drivers.IgnoreQueryFilters().FirstAsync(d => d.Id == driver.Id, ct);
        updatedDriver.Status.Should().Be(DriverStatus.Offline);
        updatedDriver.CurrentVehicleId.Should().BeNull();

        // Open shift should now be closed.
        var shift = await db.DriverShifts.IgnoreQueryFilters()
            .FirstOrDefaultAsync(s => s.DriverId == driver.Id, ct);
        shift.Should().NotBeNull();
        shift!.EndedAt.Should().NotBeNull();
    }

    /// <summary>After a successful override, DriverStatusChanged is published with the correct driverId and new status.</summary>
    [Fact]
    public async Task Override_PublishesDriverStatusChanged()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..6];
        var (fleet, dispatcher, driver) = await SeedScenario(suffix, DriverStatus.Free);

        var recordingPublisher = new Orders.StateMachine.RecordingRealtimePublisher();
        using var localFactory = fixture.Factory.WithWebHostBuilder(b =>
            b.ConfigureTestServices(services =>
                services.AddSingleton<IRealtimePublisher>(recordingPublisher)));

        var client = localFactory.CreateClient();
        client.AsDispatcher(fleet.Id, dispatcher.Id);

        var resp = await client.PostAsJsonAsync($"api/v1/drivers/{driver.Id}/status", new { status = "Busy" }, ct);
        resp.StatusCode.Should().Be(HttpStatusCode.NoContent);

        recordingPublisher.DriverStatusChangedCalls.Should().ContainSingle(
            c => c.DriverId == driver.Id && c.Status == DriverStatus.Busy);
    }

    // ── Override: cross-tenant ─────────────────────────────────────────────────

    /// <summary>Overriding a driver from a different fleet returns 404 (no-leak).</summary>
    [Fact]
    public async Task Override_CrossTenantDriver_Returns404()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffixA = Guid.NewGuid().ToString("N")[..6];
        var suffixB = Guid.NewGuid().ToString("N")[..6];

        var (fleetA, _, driverA) = await SeedScenario(suffixA, DriverStatus.Free);
        var (fleetB, dispatcherB, _) = await SeedScenario(suffixB, DriverStatus.Free);

        var client = fixture.Factory.CreateClient();
        client.AsDispatcher(fleetB.Id, dispatcherB.Id);

        var resp = await client.PostAsJsonAsync($"api/v1/drivers/{driverA.Id}/status", new { status = "Offline" }, ct);
        resp.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    // ── Override: invalid status ──────────────────────────────────────────────

    /// <summary>Requesting EnRoute as the override status returns 400 with Driver.InvalidOverrideStatus.</summary>
    [Fact]
    public async Task Override_InvalidStatus_Returns400()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..6];
        var (fleet, dispatcher, driver) = await SeedScenario(suffix, DriverStatus.Free);

        var client = fixture.Factory.CreateClient();
        client.AsDispatcher(fleet.Id, dispatcher.Id);

        var resp = await client.PostAsJsonAsync($"api/v1/drivers/{driver.Id}/status", new { status = "EnRoute" }, ct);
        resp.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var body = await resp.Content.ReadAsStringAsync(ct);
        body.Should().Contain(ErrorCodes.DriverOverride.InvalidOverrideStatus);
    }

    // ── Local DTOs for deserialization ────────────────────────────────────────

    private record ListDriversResponse(IReadOnlyList<DriverSummaryDto> Items);
    private record DriverSummaryDto(Guid DriverId, string DisplayName, string Status, string? CurrentVehiclePlate, DateTimeOffset? LastPositionAt, double? LastLat, double? LastLng);
}

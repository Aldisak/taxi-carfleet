using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Staff;

/// <summary>Integration and unit tests for staff CRUD endpoints (WI-12).</summary>
[Collection(TestCollections.Database)]
public sealed class StaffCrudTests(PostgresFixture fixture)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        Converters = { new System.Text.Json.Serialization.JsonStringEnumConverter() }
    };

    // ── Seed helpers ──────────────────────────────────────────────────────────

    private static Fleet BuildFleet(string slugSuffix) => new()
    {
        Id = Guid.CreateVersion7(),
        Slug = $"staff-{slugSuffix}",
        Name = $"Staff Test Fleet {slugSuffix}",
        Phone = "+420600800001",
        Currency = "CZK",
        TimeZone = "Europe/Prague",
        IsActive = true,
        CreatedAt = DateTimeOffset.UtcNow
    };

    private static User BuildFleetAdminUser(Guid fleetId, string emailSuffix, string phoneSuffix) => new()
    {
        Id = Guid.CreateVersion7(),
        FleetId = fleetId,
        Role = UserRole.FleetAdmin,
        Email = $"admin-{emailSuffix}@staff-test.local",
        Phone = $"+420700{phoneSuffix}",
        PasswordHash = BCrypt.Net.BCrypt.HashPassword("AdminPass123!"),
        DisplayName = "Fleet Admin",
        IsActive = true,
        CreatedAt = DateTimeOffset.UtcNow
    };

    private static User BuildDispatcherUser(Guid fleetId, string emailSuffix, string phoneSuffix) => new()
    {
        Id = Guid.CreateVersion7(),
        FleetId = fleetId,
        Role = UserRole.Dispatcher,
        Email = $"dispatcher-{emailSuffix}@staff-test.local",
        Phone = $"+420710{phoneSuffix}",
        PasswordHash = BCrypt.Net.BCrypt.HashPassword("DispPass123!"),
        DisplayName = "Test Dispatcher",
        IsActive = true,
        CreatedAt = DateTimeOffset.UtcNow
    };

    private static User BuildDriverUser(Guid fleetId, string emailSuffix, string phoneSuffix) => new()
    {
        Id = Guid.CreateVersion7(),
        FleetId = fleetId,
        Role = UserRole.Driver,
        Email = $"driver-{emailSuffix}@staff-test.local",
        Phone = $"+420720{phoneSuffix}",
        PasswordHash = BCrypt.Net.BCrypt.HashPassword("DrvPass123!"),
        DisplayName = "Test Driver",
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

    private async Task SeedAsync(params object[] entities)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var currentTenant = scope.ServiceProvider.GetRequiredService<CurrentTenant>();
        currentTenant.FleetId = null;
        db.AddRange(entities);
        await db.SaveChangesAsync(TestContext.Current.CancellationToken);
    }

    // ── CreateStaff tests ─────────────────────────────────────────────────────

    /// <summary>FleetAdmin creates a dispatcher-role staff user; the plaintext temporary password is
    /// returned exactly once in the 201 response, and a login with that password succeeds.</summary>
    [Fact]
    public async Task CreateStaff_FleetAdmin_ReturnsTempPasswordOnce()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleet = BuildFleet("create-happy");
        var admin = BuildFleetAdminUser(fleet.Id, "admin-ch", "010001");
        await SeedAsync(fleet, admin);

        var client = fixture.Factory.CreateClient();
        client.AsFleetAdmin(fleet.Id, admin.Id);

        var response = await client.PostAsJsonAsync(
            "api/v1/staff",
            new { email = "newdisp@staff-test.local", displayName = "New Dispatcher", role = "Dispatcher" },
            ct);

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>(JsonOptions, ct);

        var createdId = body.GetProperty("id").GetGuid();
        var tempPassword = body.GetProperty("temporaryPassword").GetString();

        createdId.Should().NotBeEmpty();
        tempPassword.Should().NotBeNullOrEmpty();
        tempPassword!.Length.Should().Be(16);

        // Verify the password is hashed (stored hash != plaintext)
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var ct2 = scope.ServiceProvider.GetRequiredService<CurrentTenant>();
        ct2.FleetId = null;
        var created = await db.Users.IgnoreQueryFilters()
            .FirstOrDefaultAsync(u => u.Id == createdId, ct);
        created.Should().NotBeNull();
        created!.PasswordHash.Should().NotBeNullOrEmpty();
        created.PasswordHash.Should().NotBe(tempPassword, "the stored hash must not equal the plaintext temp password");

        // The stored hash must verify the plaintext temp password (login check)
        BCrypt.Net.BCrypt.Verify(tempPassword, created.PasswordHash).Should().BeTrue();

        // Login with temp password must succeed via staff login endpoint
        var loginClient = fixture.Factory.CreateClient();
        var loginResp = await loginClient.PostAsJsonAsync(
            "api/v1/auth/staff/login",
            new { fleetSlug = fleet.Slug, email = "newdisp@staff-test.local", password = tempPassword },
            ct);
        loginResp.StatusCode.Should().Be(HttpStatusCode.OK,
            "logging in with the temporary password must succeed");
    }

    /// <summary>Creating a staff user with role Driver also creates the linked Driver row.</summary>
    [Fact]
    public async Task CreateStaff_DriverRole_CreatesLinkedDriverRow()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleet = BuildFleet("create-driver");
        var admin = BuildFleetAdminUser(fleet.Id, "admin-cd", "011001");
        await SeedAsync(fleet, admin);

        var client = fixture.Factory.CreateClient();
        client.AsFleetAdmin(fleet.Id, admin.Id);

        var response = await client.PostAsJsonAsync(
            "api/v1/staff",
            new { email = "newdriver@staff-test.local", displayName = "New Driver", role = "Driver" },
            ct);

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>(JsonOptions, ct);
        var createdId = body.GetProperty("id").GetGuid();

        // Verify the Driver row was created
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var tenant = scope.ServiceProvider.GetRequiredService<CurrentTenant>();
        tenant.FleetId = null;

        var driverRow = await db.Drivers.IgnoreQueryFilters()
            .FirstOrDefaultAsync(d => d.UserId == createdId, ct);
        driverRow.Should().NotBeNull("creating a Driver-role staff must create a linked Driver row");
        driverRow!.Status.Should().Be(DriverStatus.Offline);
        driverRow.FleetId.Should().Be(fleet.Id);
    }

    /// <summary>Creating staff with an email already used by another staff member in the same fleet returns 409.</summary>
    [Fact]
    public async Task CreateStaff_DuplicateEmailInFleet_Returns409()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleet = BuildFleet("create-dup");
        var admin = BuildFleetAdminUser(fleet.Id, "admin-dup", "012001");
        var existing = BuildDispatcherUser(fleet.Id, "dup-existing", "013001");
        await SeedAsync(fleet, admin, existing);

        var client = fixture.Factory.CreateClient();
        client.AsFleetAdmin(fleet.Id, admin.Id);

        var response = await client.PostAsJsonAsync(
            "api/v1/staff",
            new { email = existing.Email, displayName = "Duplicate", role = "Dispatcher" },
            ct);

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    /// <summary>A non-FleetAdmin (Dispatcher) calling CreateStaff gets 403.</summary>
    [Fact]
    public async Task CreateStaff_Dispatcher_Returns403()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleet = BuildFleet("create-disp-403");
        var dispatcher = BuildDispatcherUser(fleet.Id, "disp-403", "014001");
        await SeedAsync(fleet, dispatcher);

        var client = fixture.Factory.CreateClient();
        client.AsDispatcher(fleet.Id, dispatcher.Id);

        var response = await client.PostAsJsonAsync(
            "api/v1/staff",
            new { email = "new@staff-test.local", displayName = "Unauthorized", role = "Dispatcher" },
            ct);

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    // ── ListStaff tests ───────────────────────────────────────────────────────

    /// <summary>FleetAdmin can list staff users for their fleet.</summary>
    [Fact]
    public async Task ListStaff_FleetAdmin_Returns200()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleet = BuildFleet("list-happy");
        var admin = BuildFleetAdminUser(fleet.Id, "admin-lh", "020001");
        var dispatcher = BuildDispatcherUser(fleet.Id, "disp-lh", "021001");
        await SeedAsync(fleet, admin, dispatcher);

        var client = fixture.Factory.CreateClient();
        client.AsFleetAdmin(fleet.Id, admin.Id);

        var response = await client.GetAsync("api/v1/staff", ct);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>(JsonOptions, ct);
        var items = body.GetProperty("items").EnumerateArray().ToList();
        items.Should().Contain(e => e.GetProperty("id").GetGuid() == dispatcher.Id);
    }

    /// <summary>FleetAdmin of fleet B cannot see fleet A staff (tenant isolation).</summary>
    [Fact]
    public async Task ListStaff_FleetAdminOfFleetB_CannotSeeFleetAStaff()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleetA = BuildFleet("list-iso-a");
        var fleetB = BuildFleet("list-iso-b");
        var adminB = BuildFleetAdminUser(fleetB.Id, "admin-isob", "022001");
        var dispA = BuildDispatcherUser(fleetA.Id, "disp-isoa", "023001");
        await SeedAsync(fleetA, fleetB, adminB, dispA);

        var client = fixture.Factory.CreateClient();
        client.AsFleetAdmin(fleetB.Id, adminB.Id);

        var response = await client.GetAsync("api/v1/staff", ct);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>(JsonOptions, ct);
        var items = body.GetProperty("items").EnumerateArray().ToList();
        items.Should().NotContain(e => e.GetProperty("id").GetGuid() == dispA.Id,
            "fleet B admin must not see fleet A staff");
    }

    // ── GetStaff tests ────────────────────────────────────────────────────────

    /// <summary>FleetAdmin can get a staff user's detail.</summary>
    [Fact]
    public async Task GetStaff_FleetAdmin_Returns200()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleet = BuildFleet("get-happy");
        var admin = BuildFleetAdminUser(fleet.Id, "admin-gh", "030001");
        var dispatcher = BuildDispatcherUser(fleet.Id, "disp-gh", "031001");
        await SeedAsync(fleet, admin, dispatcher);

        var client = fixture.Factory.CreateClient();
        client.AsFleetAdmin(fleet.Id, admin.Id);

        var response = await client.GetAsync($"api/v1/staff/{dispatcher.Id}", ct);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>(JsonOptions, ct);
        body.GetProperty("id").GetGuid().Should().Be(dispatcher.Id);
        body.GetProperty("email").GetString().Should().Be(dispatcher.Email);
        body.GetProperty("displayName").GetString().Should().Be(dispatcher.DisplayName);
    }

    /// <summary>FleetAdmin trying to get a staff user from another fleet gets 404 (no-leak).</summary>
    [Fact]
    public async Task GetStaff_CrossTenant_Returns404()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleetA = BuildFleet("get-xt-a");
        var fleetB = BuildFleet("get-xt-b");
        var adminA = BuildFleetAdminUser(fleetA.Id, "admin-xta", "040001");
        var dispB = BuildDispatcherUser(fleetB.Id, "disp-xtb", "041001");
        await SeedAsync(fleetA, fleetB, adminA, dispB);

        var client = fixture.Factory.CreateClient();
        client.AsFleetAdmin(fleetA.Id, adminA.Id);

        var response = await client.GetAsync($"api/v1/staff/{dispB.Id}", ct);

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    // ── UpdateStaff tests ─────────────────────────────────────────────────────

    /// <summary>FleetAdmin can update a staff user's displayName, phone, and isActive.</summary>
    [Fact]
    public async Task UpdateStaff_FleetAdmin_UpdatesFields()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleet = BuildFleet("update-happy");
        var admin = BuildFleetAdminUser(fleet.Id, "admin-uh", "050001");
        var dispatcher = BuildDispatcherUser(fleet.Id, "disp-uh", "051001");
        await SeedAsync(fleet, admin, dispatcher);

        var client = fixture.Factory.CreateClient();
        client.AsFleetAdmin(fleet.Id, admin.Id);

        var response = await client.PutAsJsonAsync(
            $"api/v1/staff/{dispatcher.Id}",
            new { displayName = "Updated Name", phone = "+420999888777", isActive = true },
            ct);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>(JsonOptions, ct);
        body.GetProperty("displayName").GetString().Should().Be("Updated Name");
    }

    /// <summary>A non-FleetAdmin (Dispatcher) calling UpdateStaff gets 403 (FleetAdminOnly policy).</summary>
    [Fact]
    public async Task UpdateStaff_NonFleetAdmin_Returns403()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleet = BuildFleet("update-403-disp");
        var dispatcher = BuildDispatcherUser(fleet.Id, "disp-upd403", "090001");
        var target = BuildDriverUser(fleet.Id, "drv-upd403", "091001");
        await SeedAsync(fleet, dispatcher, target);

        var client = fixture.Factory.CreateClient();
        client.AsDispatcher(fleet.Id, dispatcher.Id);

        var response = await client.PutAsJsonAsync(
            $"api/v1/staff/{target.Id}",
            new { displayName = "Hacker", phone = "+420999000001", isActive = true },
            ct);

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    /// <summary>FleetAdmin cannot deactivate themselves via PUT isActive=false (self-deactivation guard).</summary>
    [Fact]
    public async Task UpdateStaff_SelfDeactivate_Returns409()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleet = BuildFleet("update-self-deact");
        var admin = BuildFleetAdminUser(fleet.Id, "admin-sda", "092001");
        await SeedAsync(fleet, admin);

        var client = fixture.Factory.CreateClient();
        client.AsFleetAdmin(fleet.Id, admin.Id);

        var response = await client.PutAsJsonAsync(
            $"api/v1/staff/{admin.Id}",
            new { displayName = admin.DisplayName, phone = admin.Phone, isActive = false },
            ct);

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    /// <summary>FleetAdmin cannot deactivate an online driver via PUT isActive=false (online-driver guard).</summary>
    [Fact]
    public async Task UpdateStaff_OnlineDriverDeactivate_Returns409()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleet = BuildFleet("update-online-drv");
        var admin = BuildFleetAdminUser(fleet.Id, "admin-odd", "093001");
        var driverUser = BuildDriverUser(fleet.Id, "drv-odd", "094001");
        var driver = BuildDriver(fleet.Id, driverUser.Id, DriverStatus.Free);
        await SeedAsync(fleet, admin, driverUser, driver);

        var client = fixture.Factory.CreateClient();
        client.AsFleetAdmin(fleet.Id, admin.Id);

        var response = await client.PutAsJsonAsync(
            $"api/v1/staff/{driverUser.Id}",
            new { displayName = driverUser.DisplayName, phone = driverUser.Phone, isActive = false },
            ct);

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    // ── DeactivateStaff tests ─────────────────────────────────────────────────

    /// <summary>FleetAdmin can deactivate a staff user; the deactivated user can no longer log in.</summary>
    [Fact]
    public async Task DeactivateStaff_SetsInactive()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleet = BuildFleet("deact-happy");
        var admin = BuildFleetAdminUser(fleet.Id, "admin-dh", "060001");
        var dispatcher = BuildDispatcherUser(fleet.Id, "disp-dh", "061001");
        await SeedAsync(fleet, admin, dispatcher);

        var client = fixture.Factory.CreateClient();
        client.AsFleetAdmin(fleet.Id, admin.Id);

        var response = await client.DeleteAsync($"api/v1/staff/{dispatcher.Id}", ct);
        response.StatusCode.Should().Be(HttpStatusCode.NoContent);

        // Verify IsActive=false in DB
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var tenant = scope.ServiceProvider.GetRequiredService<CurrentTenant>();
        tenant.FleetId = null;
        var deactivated = await db.Users.IgnoreQueryFilters()
            .FirstOrDefaultAsync(u => u.Id == dispatcher.Id, ct);
        deactivated!.IsActive.Should().BeFalse();

        // Deactivated user login must fail with 401
        var loginClient = fixture.Factory.CreateClient();
        var loginResp = await loginClient.PostAsJsonAsync(
            "api/v1/auth/staff/login",
            new { fleetSlug = fleet.Slug, email = dispatcher.Email, password = "DispPass123!" },
            ct);
        loginResp.StatusCode.Should().Be(HttpStatusCode.Unauthorized,
            "a deactivated staff member must not be able to log in");
    }

    /// <summary>Trying to deactivate an online driver (Status != Offline) returns 409.</summary>
    [Fact]
    public async Task DeactivateStaff_OnlineDriver_Returns409()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleet = BuildFleet("deact-online");
        var admin = BuildFleetAdminUser(fleet.Id, "admin-do", "070001");
        var driverUser = BuildDriverUser(fleet.Id, "drv-do", "071001");
        var driver = BuildDriver(fleet.Id, driverUser.Id, DriverStatus.Free);
        await SeedAsync(fleet, admin, driverUser, driver);

        var client = fixture.Factory.CreateClient();
        client.AsFleetAdmin(fleet.Id, admin.Id);

        var response = await client.DeleteAsync($"api/v1/staff/{driverUser.Id}", ct);
        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    /// <summary>FleetAdmin cannot deactivate themselves (self-deactivation guard returns 409).</summary>
    [Fact]
    public async Task DeactivateStaff_Self_Returns409()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleet = BuildFleet("deact-self");
        var admin = BuildFleetAdminUser(fleet.Id, "admin-self", "080001");
        await SeedAsync(fleet, admin);

        var client = fixture.Factory.CreateClient();
        client.AsFleetAdmin(fleet.Id, admin.Id);

        var response = await client.DeleteAsync($"api/v1/staff/{admin.Id}", ct);
        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }
}

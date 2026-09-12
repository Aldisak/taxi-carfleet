using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Tests.Infrastructure;
namespace Taxi.Api.Tests.FleetFeature;

/// <summary>Integration tests for GET /fleet/settings (A5).</summary>
[Collection(TestCollections.Database)]
public sealed class FleetSettingsTests(PostgresFixture fixture)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    // ── Seed helpers ──────────────────────────────────────────────────────────

    private static Fleet BuildFleet(string slugSuffix, string name) => new()
    {
        Id = Guid.CreateVersion7(),
        Slug = $"fs-{slugSuffix}",
        Name = name,
        Phone = "+420605100001",
        Currency = "CZK",
        TimeZone = "Europe/Prague",
        IsActive = true,
        CreatedAt = DateTimeOffset.UtcNow
    };

    private static User BuildFleetAdmin(Guid fleetId, string phoneSuffix) => new()
    {
        Id = Guid.CreateVersion7(),
        FleetId = fleetId,
        Role = UserRole.FleetAdmin,
        Email = $"admin-{phoneSuffix}@fs-test.local",
        Phone = $"+420730{phoneSuffix}",
        DisplayName = "Fleet Admin",
        PasswordHash = BCrypt.Net.BCrypt.HashPassword("Pass123!"),
        IsActive = true,
        CreatedAt = DateTimeOffset.UtcNow
    };

    private static FleetSettings BuildFleetSettings(Guid fleetId, int offerTimeout = 45, bool autoDispatch = false) => new()
    {
        FleetId = fleetId,
        OfferTimeoutSeconds = offerTimeout,
        AutoDispatchEnabled = autoDispatch
    };

    // ── Happy path ─────────────────────────────────────────────────────────────

    /// <summary>GET /fleet/settings returns combined Fleet + FleetSettings DTO for the current fleet admin.</summary>
    [Fact]
    public async Task GetFleetSettings_FleetAdmin_ReturnsCombinedDto()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..6];

        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        var fleet = BuildFleet(suffix, "Alpha Fleet");
        fleet.Phone = "+420777111222";
        var admin = BuildFleetAdmin(fleet.Id, suffix[..6]);
        var settings = BuildFleetSettings(fleet.Id, offerTimeout: 60, autoDispatch: true);

        db.Fleets.Add(fleet);
        db.FleetSettings.Add(settings);
        db.Users.Add(admin);
        await db.SaveChangesAsync(ct);

        var client = fixture.Factory.CreateClient();
        client.AsFleetAdmin(fleet.Id, admin.Id);

        var resp = await client.GetAsync("api/v1/fleet/settings", ct);
        resp.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await resp.Content.ReadFromJsonAsync<GetFleetSettingsResponse>(JsonOptions, ct);
        body.Should().NotBeNull();
        body!.Name.Should().Be("Alpha Fleet");
        body.Phone.Should().Be("+420777111222");
        body.OfferTimeoutSeconds.Should().Be(60);
        body.AutoDispatchEnabled.Should().BeTrue();
    }

    // ── Tenant isolation ──────────────────────────────────────────────────────

    /// <summary>FleetAdmin of Fleet B sees only Fleet B settings, not Fleet A settings.</summary>
    [Fact]
    public async Task GetFleetSettings_FleetAdminOfFleetB_SeesOnlyFleetBSettings()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffixA = Guid.NewGuid().ToString("N")[..6];
        var suffixB = Guid.NewGuid().ToString("N")[..6];

        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        var fleetA = BuildFleet(suffixA + "a", "Fleet A Isolation");
        var fleetB = BuildFleet(suffixB + "b", "Fleet B Isolation");
        var settingsA = BuildFleetSettings(fleetA.Id, offerTimeout: 30, autoDispatch: false);
        var settingsB = BuildFleetSettings(fleetB.Id, offerTimeout: 90, autoDispatch: true);
        var adminB = BuildFleetAdmin(fleetB.Id, suffixB[..6]);

        db.Fleets.Add(fleetA);
        db.Fleets.Add(fleetB);
        db.FleetSettings.Add(settingsA);
        db.FleetSettings.Add(settingsB);
        db.Users.Add(adminB);
        await db.SaveChangesAsync(ct);

        var client = fixture.Factory.CreateClient();
        client.AsFleetAdmin(fleetB.Id, adminB.Id);

        var resp = await client.GetAsync("api/v1/fleet/settings", ct);
        resp.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await resp.Content.ReadFromJsonAsync<GetFleetSettingsResponse>(JsonOptions, ct);
        body.Should().NotBeNull();
        body!.Name.Should().Be("Fleet B Isolation");
        body.OfferTimeoutSeconds.Should().Be(90);
        body.AutoDispatchEnabled.Should().BeTrue();
    }

    // ── Authorization ─────────────────────────────────────────────────────────

    /// <summary>Non-FleetAdmin (e.g. Dispatcher) gets 403.</summary>
    [Fact]
    public async Task GetFleetSettings_NonFleetAdmin_Returns403()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..6];

        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        var fleet = BuildFleet(suffix + "c", "Fleet C Auth");
        db.Fleets.Add(fleet);
        await db.SaveChangesAsync(ct);

        var client = fixture.Factory.CreateClient();
        client.AsDispatcher(fleet.Id);

        var resp = await client.GetAsync("api/v1/fleet/settings", ct);
        resp.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    // ── Local DTO ─────────────────────────────────────────────────────────────

    private record GetFleetSettingsResponse(
        string Name,
        string Phone,
        int OfferTimeoutSeconds,
        bool AutoDispatchEnabled);
}

using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Common.Security;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Infrastructure.Geo;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Admin;

/// <summary>Integration tests for GET + PUT /api/v1/admin/fleets/{id}/settings (WI-2, SuperAdminOnly).</summary>
[Collection(TestCollections.Database)]
public sealed class TenantSettingsTests(PostgresFixture fixture)
{
    // ── Happy path: SuperAdmin updates another fleet's settings ───────────────

    /// <summary>SuperAdmin puts valid settings → 204 and the row is changed in the database.</summary>
    [Fact]
    public async Task HandleAsync_ValidRequest_Returns204AndRowChanged()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, _) = await SeedFleetAsync("ts-update-happy", ct);

        var client = fixture.Factory.CreateClient().AsSuperAdmin();
        var req = BuildValidRequest();
        req["name"] = "Updated Fleet Name";
        req["offerTimeoutSeconds"] = 120;

        var resp = await client.PutAsJsonAsync($"/api/v1/admin/fleets/{fleetId}/settings", req, ct);

        resp.StatusCode.Should().Be(HttpStatusCode.NoContent);

        // Verify row changed in DB
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var fleet = await db.Fleets.AsNoTracking().FirstAsync(f => f.Id == fleetId, ct);
        var settings = await db.FleetSettings.IgnoreQueryFilters().AsNoTracking()
            .FirstOrDefaultAsync(s => s.FleetId == fleetId, ct);

        fleet.Name.Should().Be("Updated Fleet Name");
        settings.Should().NotBeNull();
        settings!.OfferTimeoutSeconds.Should().Be(120);
    }

    // ── Mapy round-trip via real IFleetKeyProtector ───────────────────────────

    /// <summary>After PUT with a plaintext Mapy key the DB column is ciphertext (≠ plaintext)
    /// and MapyKeyResolver.Resolve returns the original plaintext.</summary>
    [Fact]
    public async Task HandleAsync_MapyServerKeySet_StoredAsCiphertextResolvesPlaintext()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, _) = await SeedFleetAsync("ts-mapy-roundtrip", ct);

        const string plaintextKey = "test-mapy-server-key-roundtrip-abc123";
        var client = fixture.Factory.CreateClient().AsSuperAdmin();
        var req = BuildValidRequest();
        req["mapyServerKey"] = plaintextKey;

        var resp = await client.PutAsJsonAsync($"/api/v1/admin/fleets/{fleetId}/settings", req, ct);
        resp.StatusCode.Should().Be(HttpStatusCode.NoContent);

        // Read stored ciphertext
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var settings = await db.FleetSettings.IgnoreQueryFilters().AsNoTracking()
            .FirstAsync(s => s.FleetId == fleetId, ct);

        settings.MapyServerKey.Should().NotBeNullOrEmpty("key must be stored");
        settings.MapyServerKey.Should().NotBe(plaintextKey, "stored value must be ciphertext, not plaintext");

        // Verify MapyKeyResolver decrypts it
        var keyResolver = scope.ServiceProvider.GetRequiredService<MapyKeyResolver>();
        var resolved = keyResolver.Resolve(settings);
        resolved.Should().Be(plaintextKey, "MapyKeyResolver must decrypt back to the original plaintext");
    }

    // ── GET has flag but no server-key value ──────────────────────────────────

    /// <summary>GET response has mapyServerKeyConfigured flag but the server-key value is structurally absent.</summary>
    [Fact]
    public async Task HandleAsync_Get_HasConfiguredFlagButNoServerKeyValue()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, _) = await SeedFleetAsync("ts-get-no-serverkey", ct);

        // Set a server key via PUT first
        var client = fixture.Factory.CreateClient().AsSuperAdmin();
        var putReq = BuildValidRequest();
        putReq["mapyServerKey"] = "some-server-key-12345";
        var putResp = await client.PutAsJsonAsync($"/api/v1/admin/fleets/{fleetId}/settings", putReq, ct);
        putResp.StatusCode.Should().Be(HttpStatusCode.NoContent);

        // Now GET and verify
        var getResp = await client.GetAsync($"/api/v1/admin/fleets/{fleetId}/settings", ct);
        getResp.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await getResp.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>(ct);
        body.TryGetProperty("mapyServerKeyConfigured", out var flag).Should().BeTrue("flag must be present");
        flag.GetBoolean().Should().BeTrue("key was configured so flag must be true");

        // The server key value must not appear anywhere
        body.TryGetProperty("mapyServerKey", out _).Should().BeFalse("server key value must be structurally absent from response");
        var rawJson = body.GetRawText();
        rawJson.Should().NotContain("some-server-key-12345", "the plaintext server key must never appear in the response");
    }

    // ── Blank server key → keep, empty string → clear ────────────────────────

    /// <summary>Sending null for mapyServerKey leaves the existing column unchanged (keep semantic).</summary>
    [Fact]
    public async Task HandleAsync_NullServerKey_KeepsExistingKey()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, _) = await SeedFleetAsync("ts-mapy-keep", ct);

        // Set initial key
        var client = fixture.Factory.CreateClient().AsSuperAdmin();
        var req1 = BuildValidRequest();
        req1["mapyServerKey"] = "initial-server-key-abc";
        var r1 = await client.PutAsJsonAsync($"/api/v1/admin/fleets/{fleetId}/settings", req1, ct);
        r1.StatusCode.Should().Be(HttpStatusCode.NoContent);

        // Read the ciphertext
        await using var scope1 = fixture.Factory.Services.CreateAsyncScope();
        var db1 = scope1.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var original = await db1.FleetSettings.IgnoreQueryFilters().AsNoTracking()
            .FirstAsync(s => s.FleetId == fleetId, ct);
        var originalCiphertext = original.MapyServerKey;
        originalCiphertext.Should().NotBeNullOrEmpty();

        // Send null → should keep
        var req2 = BuildValidRequest();
        req2["mapyServerKey"] = null; // explicit null = keep
        var r2 = await client.PutAsJsonAsync($"/api/v1/admin/fleets/{fleetId}/settings", req2, ct);
        r2.StatusCode.Should().Be(HttpStatusCode.NoContent);

        await using var scope2 = fixture.Factory.Services.CreateAsyncScope();
        var db2 = scope2.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var after = await db2.FleetSettings.IgnoreQueryFilters().AsNoTracking()
            .FirstAsync(s => s.FleetId == fleetId, ct);

        after.MapyServerKey.Should().Be(originalCiphertext, "null request value must leave the column unchanged");
    }

    /// <summary>Sending empty string for mapyServerKey clears the column (clear semantic).</summary>
    [Fact]
    public async Task HandleAsync_EmptyStringServerKey_ClearsKey()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, _) = await SeedFleetAsync("ts-mapy-clear", ct);

        // Set initial key
        var client = fixture.Factory.CreateClient().AsSuperAdmin();
        var req1 = BuildValidRequest();
        req1["mapyServerKey"] = "key-to-clear";
        var r1 = await client.PutAsJsonAsync($"/api/v1/admin/fleets/{fleetId}/settings", req1, ct);
        r1.StatusCode.Should().Be(HttpStatusCode.NoContent);

        // Send "" → should clear
        var req2 = BuildValidRequest();
        req2["mapyServerKey"] = "";
        var r2 = await client.PutAsJsonAsync($"/api/v1/admin/fleets/{fleetId}/settings", req2, ct);
        r2.StatusCode.Should().Be(HttpStatusCode.NoContent);

        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var after = await db.FleetSettings.IgnoreQueryFilters().AsNoTracking()
            .FirstAsync(s => s.FleetId == fleetId, ct);

        after.MapyServerKey.Should().BeNull("empty string must clear the column");
    }

    // ── Browser key three branches ────────────────────────────────────────────

    /// <summary>Sending a plaintext browser key stores ciphertext; GET decrypts it back.</summary>
    [Fact]
    public async Task HandleAsync_BrowserKeySet_StoredAndDecryptedOnGet()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, _) = await SeedFleetAsync("ts-browserkey-set", ct);

        const string plainBrowserKey = "browser-key-test-xyz";
        var client = fixture.Factory.CreateClient().AsSuperAdmin();
        var req = BuildValidRequest();
        req["mapyBrowserKey"] = plainBrowserKey;

        var putResp = await client.PutAsJsonAsync($"/api/v1/admin/fleets/{fleetId}/settings", req, ct);
        putResp.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var getResp = await client.GetAsync($"/api/v1/admin/fleets/{fleetId}/settings", ct);
        getResp.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await getResp.Content.ReadFromJsonAsync<GetTenantSettingsTestDto>(ct);
        body.Should().NotBeNull();
        body!.MapyBrowserKey.Should().Be(plainBrowserKey, "GET must decrypt the browser key for return");
    }

    /// <summary>Sending null browser key keeps the existing value; GET still returns it.</summary>
    [Fact]
    public async Task HandleAsync_NullBrowserKey_KeepsExistingBrowserKey()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, _) = await SeedFleetAsync("ts-browserkey-keep", ct);

        const string plainBrowserKey = "keep-this-browser-key";
        var client = fixture.Factory.CreateClient().AsSuperAdmin();
        var req1 = BuildValidRequest();
        req1["mapyBrowserKey"] = plainBrowserKey;
        var r1 = await client.PutAsJsonAsync($"/api/v1/admin/fleets/{fleetId}/settings", req1, ct);
        r1.StatusCode.Should().Be(HttpStatusCode.NoContent);

        // Send null → keep
        var req2 = BuildValidRequest();
        req2["mapyBrowserKey"] = null;
        var r2 = await client.PutAsJsonAsync($"/api/v1/admin/fleets/{fleetId}/settings", req2, ct);
        r2.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var getResp = await client.GetAsync($"/api/v1/admin/fleets/{fleetId}/settings", ct);
        var body = await getResp.Content.ReadFromJsonAsync<GetTenantSettingsTestDto>(ct);
        body!.MapyBrowserKey.Should().Be(plainBrowserKey, "null must keep the existing browser key");
    }

    /// <summary>Sending empty string browser key clears it; GET returns null.</summary>
    [Fact]
    public async Task HandleAsync_EmptyStringBrowserKey_ClearsBrowserKey()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, _) = await SeedFleetAsync("ts-browserkey-clear", ct);

        var client = fixture.Factory.CreateClient().AsSuperAdmin();
        var req1 = BuildValidRequest();
        req1["mapyBrowserKey"] = "clear-this-browser-key";
        var r1 = await client.PutAsJsonAsync($"/api/v1/admin/fleets/{fleetId}/settings", req1, ct);
        r1.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var req2 = BuildValidRequest();
        req2["mapyBrowserKey"] = "";
        var r2 = await client.PutAsJsonAsync($"/api/v1/admin/fleets/{fleetId}/settings", req2, ct);
        r2.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var getResp = await client.GetAsync($"/api/v1/admin/fleets/{fleetId}/settings", ct);
        var body = await getResp.Content.ReadFromJsonAsync<GetTenantSettingsTestDto>(ct);
        body!.MapyBrowserKey.Should().BeNull("empty string must clear the browser key");
    }

    // ── 403 for non-SuperAdmin ─────────────────────────────────────────────────

    /// <summary>FleetAdmin is forbidden from the SuperAdmin-only endpoints.</summary>
    [Fact]
    public async Task HandleAsync_FleetAdmin_Returns403()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, adminId) = await SeedFleetAsync("ts-403-admin", ct);

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminId);

        var getResp = await client.GetAsync($"/api/v1/admin/fleets/{fleetId}/settings", ct);
        getResp.StatusCode.Should().Be(HttpStatusCode.Forbidden);

        var putResp = await client.PutAsJsonAsync($"/api/v1/admin/fleets/{fleetId}/settings", BuildValidRequest(), ct);
        putResp.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    // ── 404 for unknown fleet ─────────────────────────────────────────────────

    /// <summary>Requesting settings for a non-existent fleet returns 404.</summary>
    [Fact]
    public async Task HandleAsync_UnknownFleet_Returns404()
    {
        var ct = TestContext.Current.CancellationToken;
        var unknownId = Guid.CreateVersion7();
        var client = fixture.Factory.CreateClient().AsSuperAdmin();

        var getResp = await client.GetAsync($"/api/v1/admin/fleets/{unknownId}/settings", ct);
        getResp.StatusCode.Should().Be(HttpStatusCode.NotFound);

        var putResp = await client.PutAsJsonAsync($"/api/v1/admin/fleets/{unknownId}/settings", BuildValidRequest(), ct);
        putResp.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    // ── 400 invalid body ──────────────────────────────────────────────────────

    /// <summary>Sending an invalid body (empty name) returns 400.</summary>
    [Fact]
    public async Task HandleAsync_InvalidBody_Returns400()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, _) = await SeedFleetAsync("ts-400-validation", ct);

        var client = fixture.Factory.CreateClient().AsSuperAdmin();
        var req = BuildValidRequest();
        req["name"] = ""; // invalid — name is required

        var resp = await client.PutAsJsonAsync($"/api/v1/admin/fleets/{fleetId}/settings", req, ct);
        resp.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    // ── GET defaults when no FleetSettings row ───────────────────────────────

    /// <summary>GET returns entity defaults when the fleet has no FleetSettings row.</summary>
    [Fact]
    public async Task HandleAsync_Get_ReturnsEntityDefaultsWhenNoSettingsRow()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, _) = await SeedFleetAsync("ts-get-defaults", ct);
        // No FleetSettings row seeded

        var client = fixture.Factory.CreateClient().AsSuperAdmin();
        var resp = await client.GetAsync($"/api/v1/admin/fleets/{fleetId}/settings", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<GetTenantSettingsTestDto>(ct);
        body.Should().NotBeNull();
        body!.OfferTimeoutSeconds.Should().Be(45, "entity default is 45");
        body.MapZoom.Should().Be(12, "entity default is 12");
        body.SmsMonthlyCapCzk.Should().Be(500, "entity default is 500");
        body.MapyServerKeyConfigured.Should().BeFalse("no key configured");
        body.MapyBrowserKey.Should().BeNull("no key configured");
    }

    // ── Tenant isolation (second fleet is unaffected) ─────────────────────────

    /// <summary>Updating settings for fleet A must not affect fleet B's settings row.</summary>
    [Fact]
    public async Task HandleAsync_UpdateFleetA_DoesNotAffectFleetB()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetA, _) = await SeedFleetAsync("ts-isolation-A", ct);
        var (fleetB, _) = await SeedFleetAsync("ts-isolation-B", ct);

        // Seed fleet B settings
        await SeedFleetSettingsAsync(fleetB, offerTimeoutSeconds: 99, ct);

        var client = fixture.Factory.CreateClient().AsSuperAdmin();
        var req = BuildValidRequest();
        req["offerTimeoutSeconds"] = 55;
        var resp = await client.PutAsJsonAsync($"/api/v1/admin/fleets/{fleetA}/settings", req, ct);
        resp.StatusCode.Should().Be(HttpStatusCode.NoContent);

        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var settingsB = await db.FleetSettings.IgnoreQueryFilters().AsNoTracking()
            .FirstAsync(s => s.FleetId == fleetB, ct);

        settingsB.OfferTimeoutSeconds.Should().Be(99, "fleet B settings must be untouched");
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private async Task<(Guid fleetId, Guid adminId)> SeedFleetAsync(string tag, CancellationToken ct)
    {
        var fleetId = Guid.CreateVersion7();
        var adminId = Guid.CreateVersion7();
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.Fleets.Add(new Fleet
        {
            Id = fleetId,
            Slug = $"ts-{Guid.NewGuid():N}",
            Name = $"TenantSettings {tag}",
            Phone = $"+42076{Guid.NewGuid().ToString("N")[..7]}",
            Currency = "CZK",
            TimeZone = "Europe/Prague",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        });
        db.Users.Add(new User
        {
            Id = adminId,
            FleetId = fleetId,
            Role = UserRole.FleetAdmin,
            Email = $"admin-{adminId:N}@ts.local",
            Phone = $"+42077{Guid.NewGuid().ToString("N")[..7]}",
            DisplayName = $"Admin {tag}",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync(ct);
        return (fleetId, adminId);
    }

    private async Task SeedFleetSettingsAsync(Guid fleetId, int offerTimeoutSeconds, CancellationToken ct)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.FleetSettings.Add(new FleetSettings
        {
            FleetId = fleetId,
            OfferTimeoutSeconds = offerTimeoutSeconds
        });
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Builds a valid PUT request body with all required fields set to acceptable values.</summary>
    private static Dictionary<string, object?> BuildValidRequest() => new()
    {
        ["name"] = "Valid Fleet Name",
        ["phone"] = "+420761234567",
        ["currency"] = "CZK",
        ["timeZone"] = "Europe/Prague",
        ["primaryColorHex"] = "#1A2B3C",
        ["isActive"] = true,
        ["offerTimeoutSeconds"] = 45,
        ["autoDispatchEnabled"] = false,
        ["autoDispatchAfterSeconds"] = 60,
        ["maxOfferRadiusKm"] = 15,
        ["smsSenderName"] = null,
        ["welcomeText"] = null,
        ["smsMonthlyCapCzk"] = 500,
        ["smsUnitCostCzk"] = 1,
        ["mapCenterLat"] = 50.08,
        ["mapCenterLng"] = 14.42,
        ["mapZoom"] = 12,
        ["geoMonthlyCreditBudget"] = 250000,
        ["mapyServerKey"] = null,
        ["mapyBrowserKey"] = null
    };

    // ── Local test response DTOs ──────────────────────────────────────────────

    /// <summary>Local DTO mirroring the GET response shape for test deserialization.</summary>
    private sealed class GetTenantSettingsTestDto
    {
        /// <summary>Fleet name.</summary>
        public string? Name { get; init; }
        /// <summary>Fleet phone.</summary>
        public string? Phone { get; init; }
        /// <summary>Fleet currency code.</summary>
        public string? Currency { get; init; }
        /// <summary>Fleet time zone.</summary>
        public string? TimeZone { get; init; }
        /// <summary>Offer timeout in seconds.</summary>
        public int OfferTimeoutSeconds { get; init; }
        /// <summary>SMS monthly cap in CZK.</summary>
        public int SmsMonthlyCapCzk { get; init; }
        /// <summary>Map zoom level.</summary>
        public int MapZoom { get; init; }
        /// <summary>Whether a Mapy server key is configured.</summary>
        public bool MapyServerKeyConfigured { get; init; }
        /// <summary>Mapy browser key (decrypted), or null if not configured.</summary>
        public string? MapyBrowserKey { get; init; }
    }
}

using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Common.Security;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Geo;

/// <summary>Integration tests for GET /geo/config (WI-09) — anonymous browser-key distribution.</summary>
[Collection(TestCollections.Database)]
public sealed class GeoConfigTests(PostgresFixture fixture)
{
    private const string BrowserKeyPlaintext = "test-browser-key-abc123";
    private const string ServerKeyPlaintext = "test-server-key-SECRET-xyz789";

    // ── Happy path ────────────────────────────────────────────────────────────

    /// <summary>GET /geo/config returns 200 with browser key, tile URL, attribution, center, and zoom.
    /// The server key MUST NOT appear in the response body.</summary>
    [Fact]
    public async Task HandleAsync_GeoConfigAnonymous_ReturnsBrowserKeyNotServerKey()
    {
        var ct = TestContext.Current.CancellationToken;

        var (fleetId, slug) = await SeedFleetWithKeysAsync(ct);

        var client = fixture.Factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Fleet-Slug", slug);

        var resp = await client.GetAsync("/api/v1/geo/config", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await resp.Content.ReadFromJsonAsync<GeoConfigTestResponse>(cancellationToken: ct);
        body.Should().NotBeNull();

        // Browser key MUST appear.
        body!.BrowserKey.Should().Be(BrowserKeyPlaintext,
            "the browser key must be decrypted and returned");

        // Tile URL must be non-empty Mapy.com URL.
        body.TileUrlTemplate.Should().NotBeNullOrEmpty();
        body.TileUrlTemplate.Should().Contain("mapy.cz",
            "tile URL must reference Mapy.com tiles");

        // Attribution HTML must be non-empty.
        body.AttributionHtml.Should().NotBeNullOrEmpty();

        // Map center and zoom must be populated (defaults: 50.08, 14.42, 12).
        body.MapCenterLat.Should().BeApproximately(50.08, 0.001);
        body.MapCenterLng.Should().BeApproximately(14.42, 0.001);
        body.MapZoom.Should().Be(12);
    }

    /// <summary>AC#7 structural security: the /geo/config JSON response must NEVER contain the server key value.
    /// Positive control: asserts browser key IS present so the test fails even if the endpoint returns nothing.</summary>
    [Fact]
    public async Task GeoConfig_And_PublicFleet_NeverExposeServerKey()
    {
        var ct = TestContext.Current.CancellationToken;

        var (_, slug) = await SeedFleetWithKeysAsync(ct);

        var client = fixture.Factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Fleet-Slug", slug);

        // Check /geo/config
        var configResp = await client.GetAsync("/api/v1/geo/config", ct);
        configResp.StatusCode.Should().Be(HttpStatusCode.OK);
        var configJson = await configResp.Content.ReadAsStringAsync(ct);

        // Server key plaintext must NOT appear in the config response.
        configJson.Should().NotContain(ServerKeyPlaintext,
            "the server key must never be exposed to the browser via /geo/config");

        // Browser key MUST appear (positive control so test fails if endpoint returns nothing).
        configJson.Should().Contain(BrowserKeyPlaintext,
            "the browser key must be present in /geo/config (positive control)");

        // Check /public/fleet (AC#7 extends to the public fleet endpoint too).
        var fleetResp = await client.GetAsync("/api/v1/public/fleet", ct);
        fleetResp.StatusCode.Should().Be(HttpStatusCode.OK);
        var fleetJson = await fleetResp.Content.ReadAsStringAsync(ct);

        fleetJson.Should().NotContain(ServerKeyPlaintext,
            "the server key must never appear in GET /public/fleet");
    }

    /// <summary>GET /geo/config without X-Fleet-Slug header returns 404 (no fleet resolved).</summary>
    [Fact]
    public async Task HandleAsync_GeoConfigNoSlug_Returns404()
    {
        var ct = TestContext.Current.CancellationToken;

        var client = fixture.Factory.CreateClient();
        // No X-Fleet-Slug header, no JWT.

        var resp = await client.GetAsync("/api/v1/geo/config", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    /// <summary>GET /geo/config sets Cache-Control: public, max-age=604800.</summary>
    [Fact]
    public async Task HandleAsync_GeoConfig_SetsCacheControlHeader()
    {
        var ct = TestContext.Current.CancellationToken;

        var (_, slug) = await SeedFleetWithKeysAsync(ct);

        var client = fixture.Factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Fleet-Slug", slug);

        var resp = await client.GetAsync("/api/v1/geo/config", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var cacheControl = resp.Headers.CacheControl;
        cacheControl.Should().NotBeNull();
        cacheControl!.Public.Should().BeTrue("Cache-Control must be public");
        cacheControl.MaxAge.Should().Be(TimeSpan.FromSeconds(604800),
            "Cache-Control max-age must be 604800 (one week)");
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /// <summary>Seeds a fleet + FleetSettings row with distinct browser and server keys.
    /// Returns (fleetId, slug) for test use.</summary>
    private async Task<(Guid FleetId, string Slug)> SeedFleetWithKeysAsync(CancellationToken ct)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var protector = scope.ServiceProvider.GetRequiredService<IFleetKeyProtector>();

        var fleetId = Guid.CreateVersion7();
        var slug = $"geoconfig-{Guid.NewGuid():N}"[..20];

        db.Fleets.Add(new Fleet
        {
            Id = fleetId,
            Name = "GeoConfig Test Fleet",
            Slug = slug,
            Phone = "+420000000001",
            IsActive = true
        });

        db.FleetSettings.Add(new FleetSettings
        {
            FleetId = fleetId,
            MapyBrowserKey = protector.Protect(BrowserKeyPlaintext),
            MapyServerKey = protector.Protect(ServerKeyPlaintext),
            MapCenterLat = 50.08,
            MapCenterLng = 14.42,
            MapZoom = 12
        });

        await db.SaveChangesAsync(ct);

        return (fleetId, slug);
    }

    // ── Local response DTO ────────────────────────────────────────────────────

    private sealed record GeoConfigTestResponse(
        string TileUrlTemplate,
        string BrowserKey,
        string AttributionHtml,
        double MapCenterLat,
        double MapCenterLng,
        int MapZoom);
}

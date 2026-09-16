using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Common.Geo;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Infrastructure.Geo;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Geo;

/// <summary>Integration tests verifying the anonymous-by-slug geo proxy (UC-014 WI-1).
/// suggest/geocode/reverse are AllowAnonymous; rate-limited by a non-JWT key for unauthenticated callers;
/// geocode/reverse degrade to found:false when no fleet is resolvable (F1 endpoint short-circuit).</summary>
[Collection(TestCollections.Database)]
public sealed class GeoAnonymousAccessTests(PostgresFixture fixture)
{
    private const string DemoSlug = "uc014-anon-test";

    // ── Arrange helpers ───────────────────────────────────────────────────────

    private GeoRateLimiter GetRateLimiter(TaxiApiFactory f) =>
        f.Services.GetRequiredService<GeoRateLimiter>();

    private void ResetSharedLimiter()
    {
        // Prevent bucket contamination from other tests in this collection (shared singleton).
        GetRateLimiter(fixture.Factory).Reset();
    }

    private async Task<Guid> SeedDemoFleetAsync(CancellationToken ct)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        // Idempotent: Fleet has no query filter so plain query is fine.
        var existing = await db.Fleets.AsNoTracking()
            .Where(f => f.Slug == DemoSlug)
            .Select(f => (Guid?)f.Id)
            .FirstOrDefaultAsync(ct);

        if (existing.HasValue)
            return existing.Value;

        var fleetId = Guid.CreateVersion7();
        db.Fleets.Add(new Fleet
        {
            Id = fleetId,
            Slug = DemoSlug,
            Name = "UC-014 Anon Test Fleet",
            Phone = "+420601000001",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync(ct);
        return fleetId;
    }

    // ── Happy-path anonymous tests (with fleet slug) ──────────────────────────

    /// <summary>An anonymous request with a valid X-Fleet-Slug returns 200 with suggest items (AC#1, AC#4).</summary>
    [Fact]
    public async Task Suggest_Anonymous_WithFleetSlug_Returns200WithItems()
    {
        var ct = TestContext.Current.CancellationToken;
        await SeedDemoFleetAsync(ct);
        ResetSharedLimiter();

        var fake = fixture.Factory.Services.GetRequiredService<FakeGeoService>();
        fake.Reset();
        fake.SuggestResult = [new MapySuggestResult("Hlavní nádraží", null, "Praha", 50.083, 14.434)];

        var client = fixture.Factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Fleet-Slug", DemoSlug);
        // No Authorization header — purely anonymous.

        var resp = await client.GetAsync("/api/v1/geo/suggest?q=Hlav", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<SuggestBody>(cancellationToken: ct);
        body.Should().NotBeNull();
        body!.Items.Should().NotBeEmpty();
        body.Items[0].Label.Should().Be("Hlavní nádraží");
    }

    /// <summary>An anonymous request with a valid X-Fleet-Slug returns 200 Found=true for reverse (AC#1, AC#4).</summary>
    [Fact]
    public async Task Reverse_Anonymous_WithFleetSlug_Returns200Found()
    {
        var ct = TestContext.Current.CancellationToken;
        await SeedDemoFleetAsync(ct);
        ResetSharedLimiter();

        var fake = fixture.Factory.Services.GetRequiredService<FakeGeoService>();
        fake.Reset();
        fake.ReverseResult = new MapyRgeocodeResult(true, "Václavské nám. 1, Praha", "Václavské nám.", "Praha");

        var client = fixture.Factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Fleet-Slug", DemoSlug);

        var resp = await client.GetAsync("/api/v1/geo/reverse?lat=50.0808&lng=14.4284", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<ReverseBody>(cancellationToken: ct);
        body.Should().NotBeNull();
        body!.Found.Should().BeTrue();
        body.Label.Should().NotBeNullOrEmpty();
    }

    /// <summary>An anonymous request with a valid X-Fleet-Slug returns 200 Found=true for geocode (AC#1, AC#4).</summary>
    [Fact]
    public async Task Geocode_Anonymous_WithFleetSlug_Returns200()
    {
        var ct = TestContext.Current.CancellationToken;
        await SeedDemoFleetAsync(ct);
        ResetSharedLimiter();

        var fake = fixture.Factory.Services.GetRequiredService<FakeGeoService>();
        fake.Reset();
        fake.GeocodeResult = new MapyGeocodeResult(true, "Praha 1", 50.088, 14.421);

        var client = fixture.Factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Fleet-Slug", DemoSlug);

        var resp = await client.GetAsync("/api/v1/geo/geocode?q=Praha+1", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<GeocodeBody>(cancellationToken: ct);
        body.Should().NotBeNull();
        body!.Found.Should().BeTrue();
        body.Label.Should().Be("Praha 1");
    }

    // ── Degradation tests — F1 short-circuit (no fleet slug = Guid.Empty) ─────

    /// <summary>Reverse without fleet slug returns 200 Found=false even when FakeGeoService has a positive result
    /// (F1 endpoint short-circuit — endpoint never calls GeoService when FleetId is Guid.Empty).</summary>
    [Fact]
    public async Task Reverse_Anonymous_NoFleetSlug_DegradesFoundFalse()
    {
        var ct = TestContext.Current.CancellationToken;
        ResetSharedLimiter();

        // Seed a POSITIVE result — this is what makes the test RED until the short-circuit is in place.
        var fake = fixture.Factory.Services.GetRequiredService<FakeGeoService>();
        fake.Reset();
        fake.ReverseResult = new MapyRgeocodeResult(true, "Real Address", "Real Street", "Praha");

        var client = fixture.Factory.CreateClient();
        // No X-Fleet-Slug, no JWT — CurrentTenant.FleetId will be null → Guid.Empty.

        var resp = await client.GetAsync("/api/v1/geo/reverse?lat=50.0808&lng=14.4284", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<ReverseBody>(cancellationToken: ct);
        body.Should().NotBeNull();
        body!.Found.Should().BeFalse("endpoint must short-circuit to found:false when no fleet is resolved");
        body.Label.Should().BeNull("no label should leak through the F1 short-circuit");
    }

    /// <summary>Geocode without fleet slug returns 200 Found=false even when FakeGeoService has a positive result
    /// (F1 endpoint short-circuit — endpoint never calls GeoService when FleetId is Guid.Empty).</summary>
    [Fact]
    public async Task Geocode_Anonymous_NoFleetSlug_DegradesFoundFalse()
    {
        var ct = TestContext.Current.CancellationToken;
        ResetSharedLimiter();

        // Seed a POSITIVE result — this is what makes the test RED until the short-circuit is in place.
        var fake = fixture.Factory.Services.GetRequiredService<FakeGeoService>();
        fake.Reset();
        fake.GeocodeResult = new MapyGeocodeResult(true, "Praha 1", 50.088, 14.421);

        var client = fixture.Factory.CreateClient();
        // No X-Fleet-Slug, no JWT — CurrentTenant.FleetId will be null → Guid.Empty.

        var resp = await client.GetAsync("/api/v1/geo/geocode?q=Praha+1", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<GeocodeBody>(cancellationToken: ct);
        body.Should().NotBeNull();
        body!.Found.Should().BeFalse("endpoint must short-circuit to found:false when no fleet is resolved");
    }

    /// <summary>Suggest without fleet slug returns 200 with an empty list — never 500.
    /// FakeGeoService returns the default empty SuggestResult (Reset() leaves it as []).
    /// The existing GeoService.SuggestAsync Guid.Empty bypass means no FK violation occurs;
    /// the endpoint returns whatever the fake provides (empty by default) — asserts the safe path.</summary>
    [Fact]
    public async Task Suggest_Anonymous_NoFleetSlug_DegradesEmptyList()
    {
        var ct = TestContext.Current.CancellationToken;
        ResetSharedLimiter();

        var fake = fixture.Factory.Services.GetRequiredService<FakeGeoService>();
        fake.Reset();
        // Leave SuggestResult at default [] — do NOT seed a positive result here.
        // (The F1 degradation tests for Geocode/Reverse explicitly seed positive results;
        // Suggest's Guid.Empty bypass is handled inside GeoService so the endpoint only needs
        // to document the never-500 contract with an empty-list result.)

        var client = fixture.Factory.CreateClient();
        // No X-Fleet-Slug, no JWT — CurrentTenant.FleetId will be null → Guid.Empty.

        var resp = await client.GetAsync("/api/v1/geo/suggest?q=Praha", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<SuggestBody>(cancellationToken: ct);
        body.Should().NotBeNull();
        body!.Items.Should().BeEmpty("no fleet → GeoService.SuggestAsync returns empty list via Guid.Empty bypass");
    }

    // ── Rate limit test — dedicated factory ───────────────────────────────────

    /// <summary>A burst of >5 anonymous requests per second returns 429 with Geo.RateLimited (AC#5).
    /// Uses a dedicated TaxiApiFactory to avoid contaminating the shared singleton limiter.</summary>
    [Fact]
    public async Task Suggest_Anonymous_RateLimit_Fires()
    {
        var ct = TestContext.Current.CancellationToken;

        await using var factory = new TaxiApiFactory(fixture.ConnectionString);
        var limiter = GetRateLimiter(factory);
        limiter.Reset();

        var fake = factory.Services.GetRequiredService<FakeGeoService>();
        fake.Reset();
        fake.SuggestResult = [];

        var client = factory.CreateClient();
        // No Authorization header, no X-Fleet-Slug — anonymous.

        HttpResponseMessage? last = null;
        for (var i = 0; i < 6; i++)
        {
            last = await client.GetAsync("/api/v1/geo/suggest?q=Praha", ct);
        }

        last!.StatusCode.Should().Be(HttpStatusCode.TooManyRequests,
            "anonymous callers must be throttled, not unlimited");
    }

    // ── Regression: authed customer still works ───────────────────────────────

    /// <summary>An authenticated customer JWT still returns 200 from suggest (regression — sub-keyed bucket unchanged).</summary>
    [Fact]
    public async Task Suggest_Authed_Customer_Returns200_Unchanged()
    {
        var ct = TestContext.Current.CancellationToken;
        ResetSharedLimiter();

        var fake = fixture.Factory.Services.GetRequiredService<FakeGeoService>();
        fake.Reset();
        fake.SuggestResult = [new MapySuggestResult("Praha", null, null, 50.08, 14.43)];

        var client = fixture.Factory.CreateClient();
        client.AsCustomer();

        var resp = await client.GetAsync("/api/v1/geo/suggest?q=Praha", ct);
        resp.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    // ── Response record shapes (deserialization only) ─────────────────────────

    private sealed record SuggestBody(IReadOnlyList<SuggestItem> Items);
    private sealed record SuggestItem(string Label, string? Street, string? Municipality, double Lat, double Lng);
    private sealed record ReverseBody(bool Found, string? Label, string? Street, string? Municipality);
    private sealed record GeocodeBody(bool Found, string? Label, double? Lat, double? Lng);
}

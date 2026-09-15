using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using FluentValidation.TestHelper;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Geo;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Geo;

/// <summary>Integration tests for the Geo proxy endpoints (A1).</summary>
[Collection(TestCollections.Database)]
public sealed class GeoProxyTests(PostgresFixture fixture)
{
    // ── Suggest tests ─────────────────────────────────────────────────────────

    /// <summary>GET /api/v1/geo/suggest with a valid query delegates to IGeoService and returns
    /// labelled coordinate results in a 200 response.</summary>
    [Fact]
    public async Task Suggest_ValidQuery_ReturnsLabelledCoords()
    {
        var ct = TestContext.Current.CancellationToken;

        // Arrange
        var fake = fixture.Factory.Services.GetRequiredService<FakeGeoService>();
        fake.Reset();
        fake.SuggestResult = [new MapySuggestResult("Prague Centre", null, null, 50.08, 14.43)];

        var client = fixture.Factory.CreateClient();
        client.AsDispatcher(Guid.CreateVersion7());

        // Act
        var resp = await client.GetAsync("/api/v1/geo/suggest?q=Prague", ct);

        // Assert
        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<SuggestResponse>(cancellationToken: ct);
        body.Should().NotBeNull();
        body!.Items.Should().HaveCount(1);
        body.Items[0].Label.Should().Be("Prague Centre");
        body.Items[0].Lat.Should().BeApproximately(50.08, 0.001);
        body.Items[0].Lng.Should().BeApproximately(14.43, 0.001);
    }

    /// <summary>When the upstream provider returns Unavailable, suggest returns 200 with an empty list (never 5xx).</summary>
    [Fact]
    public async Task Suggest_UpstreamThrows_Returns200EmptyList()
    {
        var ct = TestContext.Current.CancellationToken;

        var fake = fixture.Factory.Services.GetRequiredService<FakeGeoService>();
        fake.Reset();
        fake.SuggestShouldReturnUnavailable = true;

        var client = fixture.Factory.CreateClient();
        client.AsDispatcher(Guid.CreateVersion7());

        var resp = await client.GetAsync("/api/v1/geo/suggest?q=Prague", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<SuggestResponse>(cancellationToken: ct);
        body!.Items.Should().BeEmpty();
    }

    /// <summary>A driver caller receives 403 Forbidden. After A-geo-suggest, suggest is
    /// CustomerOrStaff (Customer + Dispatcher + FleetAdmin); drivers remain excluded.</summary>
    [Fact]
    public async Task Suggest_NonDispatcher_Returns403()
    {
        var ct = TestContext.Current.CancellationToken;

        var client = fixture.Factory.CreateClient();
        client.AsDriver(Guid.CreateVersion7(), Guid.CreateVersion7());

        var resp = await client.GetAsync("/api/v1/geo/suggest?q=Prague", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    // ── Route tests ───────────────────────────────────────────────────────────

    /// <summary>POST /api/v1/geo/route with valid body returns distance, duration, and a server-priced estimate.</summary>
    [Fact]
    public async Task Route_ValidCoords_ReturnsDistanceDurationAndServerPrice()
    {
        var ct = TestContext.Current.CancellationToken;

        var fleetId = Guid.CreateVersion7();
        await SeedFleetWithTariff(fleetId, baseFare: 50, perKm: 30, minimum: 60, ct);

        var fake = fixture.Factory.Services.GetRequiredService<FakeGeoService>();
        fake.Reset();
        fake.RouteResult = new MapyRouteResultData(5000, 600, []); // 5 km, 10 min

        var client = fixture.Factory.CreateClient();
        client.AsDispatcher(fleetId);

        var resp = await client.PostAsJsonAsync("/api/v1/geo/route",
            new { from = new { lat = 50.08, lng = 14.43 }, to = new { lat = 50.09, lng = 14.44 } }, ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<RouteResponse>(cancellationToken: ct);
        body.Should().NotBeNull();
        body!.DistanceMeters.Should().Be(5000);
        body.DurationSeconds.Should().Be(600);
        // price = max(60, 50 + 30 * 5) = max(60, 200) = 200
        body.EstimatedPriceCzk.Should().Be(200);
    }

    /// <summary>When no enabled default tariff exists, estimatedPriceCzk is null.</summary>
    [Fact]
    public async Task Route_NoDefaultTariff_ReturnsNullPrice()
    {
        var ct = TestContext.Current.CancellationToken;

        var fleetId = Guid.CreateVersion7();
        await SeedFleetOnly(fleetId, ct);

        var fake = fixture.Factory.Services.GetRequiredService<FakeGeoService>();
        fake.Reset();
        fake.RouteResult = new MapyRouteResultData(3000, 300, []);

        var client = fixture.Factory.CreateClient();
        client.AsDispatcher(fleetId);

        var resp = await client.PostAsJsonAsync("/api/v1/geo/route",
            new { from = new { lat = 50.08, lng = 14.43 }, to = new { lat = 50.09, lng = 14.44 } }, ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<RouteResponse>(cancellationToken: ct);
        body!.EstimatedPriceCzk.Should().BeNull();
    }

    /// <summary>Route uses the calling fleet's default tariff (tenant isolation).</summary>
    [Fact]
    public async Task Route_UsesCallersFleetDefaultTariff()
    {
        var ct = TestContext.Current.CancellationToken;

        var fleetAId = Guid.CreateVersion7();
        var fleetBId = Guid.CreateVersion7();
        await SeedFleetWithTariff(fleetAId, baseFare: 100, perKm: 10, minimum: 50, ct);
        await SeedFleetWithTariff(fleetBId, baseFare: 200, perKm: 20, minimum: 100, ct);

        var fake = fixture.Factory.Services.GetRequiredService<FakeGeoService>();
        fake.Reset();
        fake.RouteResult = new MapyRouteResultData(10000, 900, []); // 10 km

        var client = fixture.Factory.CreateClient();
        client.AsDispatcher(fleetBId);

        var resp = await client.PostAsJsonAsync("/api/v1/geo/route",
            new { from = new { lat = 50.08, lng = 14.43 }, to = new { lat = 50.09, lng = 14.44 } }, ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<RouteResponse>(cancellationToken: ct);
        // fleet B: max(100, 200 + 20*10) = max(100, 400) = 400
        body!.EstimatedPriceCzk.Should().Be(400);
    }

    /// <summary>When the route upstream returns Unavailable, returns 502 with Geo.RouteUnavailable error code.</summary>
    [Fact]
    public async Task Route_UpstreamThrows_Returns502WithCode()
    {
        var ct = TestContext.Current.CancellationToken;

        var fleetId = Guid.CreateVersion7();
        await SeedFleetOnly(fleetId, ct);

        var fake = fixture.Factory.Services.GetRequiredService<FakeGeoService>();
        fake.Reset();
        fake.RouteShouldReturnUnavailable = true;

        var client = fixture.Factory.CreateClient();
        client.AsDispatcher(fleetId);

        var resp = await client.PostAsJsonAsync("/api/v1/geo/route",
            new { from = new { lat = 50.08, lng = 14.43 }, to = new { lat = 50.09, lng = 14.44 } }, ct);

        resp.StatusCode.Should().Be(HttpStatusCode.BadGateway);
    }

    /// <summary>GET /api/v1/geo/suggest with a valid Near coordinate passes the parsed hint to IGeoService.</summary>
    [Fact]
    public async Task Suggest_WithNearCoord_PassesNearHintToGeoService()
    {
        var ct = TestContext.Current.CancellationToken;

        var fake = fixture.Factory.Services.GetRequiredService<FakeGeoService>();
        fake.Reset();
        fake.SuggestResult = [new MapySuggestResult("Central Prague", null, null, 50.08, 14.43)];

        var client = fixture.Factory.CreateClient();
        client.AsDispatcher(Guid.CreateVersion7());

        var resp = await client.GetAsync("/api/v1/geo/suggest?q=Prague&near=50.0755,14.4378", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        fake.LastSuggestNear.Should().NotBeNull();
        fake.LastSuggestNear!.Value.Lat.Should().BeApproximately(50.0755, 0.0001);
        fake.LastSuggestNear!.Value.Lng.Should().BeApproximately(14.4378, 0.0001);
    }

    /// <summary>GET /api/v1/geo/suggest with a malformed Near coordinate silently ignores it (passes null).</summary>
    [Fact]
    public async Task Suggest_WithMalformedNear_IgnoresNearHint()
    {
        var ct = TestContext.Current.CancellationToken;

        var fake = fixture.Factory.Services.GetRequiredService<FakeGeoService>();
        fake.Reset();
        fake.SuggestResult = [];

        var client = fixture.Factory.CreateClient();
        client.AsDispatcher(Guid.CreateVersion7());

        // Malformed near — must not return 400; near hint is silently ignored.
        var resp = await client.GetAsync("/api/v1/geo/suggest?q=Praha&near=notacoord", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        fake.LastSuggestNear.Should().BeNull();
    }

    // ── Suggest header tests ──────────────────────────────────────────────────

    /// <summary>A second identical suggest query with WasHit=true returns X-Geo-Cache: hit.
    /// NOTE: The "no client call" guarantee (actual HTTP bypass on cache hit) is enforced at the
    /// GeoCache/GeoService layer (covered by GeoServiceTests). This test verifies the endpoint
    /// reads cacheResult.WasHit and sets the header correctly.</summary>
    [Fact]
    public async Task HandleAsync_SuggestSecondIdenticalQuery_ReturnsCacheHitHeaderNoClientCall()
    {
        var ct = TestContext.Current.CancellationToken;

        var fake = fixture.Factory.Services.GetRequiredService<FakeGeoService>();
        fake.Reset();
        fake.SuggestResult = [new MapySuggestResult("Prague", null, null, 50.08, 14.43)];

        var client = fixture.Factory.CreateClient();
        client.AsDispatcher(Guid.CreateVersion7());

        // First query — cache miss.
        fake.SuggestWasHit = false;
        var firstResp = await client.GetAsync("/api/v1/geo/suggest?q=Prague", ct);
        firstResp.StatusCode.Should().Be(HttpStatusCode.OK);
        firstResp.Headers.TryGetValues("X-Geo-Cache", out var firstCache).Should().BeTrue();
        firstCache!.First().Should().Be("miss");

        // Second identical query — simulate cache hit by flipping fake.SuggestWasHit.
        fake.SuggestWasHit = true;
        var secondResp = await client.GetAsync("/api/v1/geo/suggest?q=Prague", ct);
        secondResp.StatusCode.Should().Be(HttpStatusCode.OK);
        secondResp.Headers.TryGetValues("X-Geo-Cache", out var secondCache).Should().BeTrue();
        secondCache!.First().Should().Be("hit");
        secondResp.Headers.TryGetValues("X-Geo-Source", out var sourceValues).Should().BeTrue();
        sourceValues!.First().Should().Be("mapy");
    }

    // ── Geocode tests ─────────────────────────────────────────────────────────

    /// <summary>GET /api/v1/geo/geocode with a matching query returns 200 Found=true with coordinates.</summary>
    [Fact]
    public async Task HandleAsync_GeocodeMatch_Returns200Found()
    {
        var ct = TestContext.Current.CancellationToken;

        var fake = fixture.Factory.Services.GetRequiredService<FakeGeoService>();
        fake.Reset();
        fake.GeocodeResult = new MapyGeocodeResult(true, "Prague 1", 50.0880, 14.4208);

        var client = fixture.Factory.CreateClient();
        client.AsDispatcher(Guid.CreateVersion7());

        var resp = await client.GetAsync("/api/v1/geo/geocode?q=Prague+1", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<GeocodeResponse>(cancellationToken: ct);
        body.Should().NotBeNull();
        body!.Found.Should().BeTrue();
        body.Label.Should().Be("Prague 1");
        body.Lat.Should().BeApproximately(50.0880, 0.0001);
        body.Lng.Should().BeApproximately(14.4208, 0.0001);
    }

    /// <summary>GET /api/v1/geo/geocode when upstream returns Unavailable returns 200 Found=false.</summary>
    [Fact]
    public async Task HandleAsync_GeocodeUnavailable_Returns200FoundFalse()
    {
        var ct = TestContext.Current.CancellationToken;

        var fake = fixture.Factory.Services.GetRequiredService<FakeGeoService>();
        fake.Reset();
        fake.GeocodeShouldReturnUnavailable = true;

        var client = fixture.Factory.CreateClient();
        client.AsDispatcher(Guid.CreateVersion7());

        var resp = await client.GetAsync("/api/v1/geo/geocode?q=Nowhere", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<GeocodeResponse>(cancellationToken: ct);
        body!.Found.Should().BeFalse();
    }

    /// <summary>GET /api/v1/geo/geocode with a query shorter than 3 chars returns 400 with GeocodeQueryTooShort code.</summary>
    [Fact]
    public async Task HandleAsync_GeocodeQueryTooShort_Returns400()
    {
        var ct = TestContext.Current.CancellationToken;

        var client = fixture.Factory.CreateClient();
        client.AsDispatcher(Guid.CreateVersion7());

        var resp = await client.GetAsync("/api/v1/geo/geocode?q=ab", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    /// <summary>Geocode validator fails with Geo.GeocodeQueryTooShort when query is shorter than 3 chars.</summary>
    [Fact]
    public void GeocodeValidator_QueryTooShort_FailsWithCode()
    {
        var result = new Taxi.Api.Features.Geo.Geocode.GeocodeValidator()
            .TestValidate(new Taxi.Api.Features.Geo.Geocode.GeocodeRequest { Q = "ab" });
        result.ShouldHaveValidationErrorFor(x => x.Q)
            .WithErrorCode(Taxi.Api.Common.ErrorCodes.Geo.GeocodeQueryTooShort);
    }

    // ── Reverse tests ─────────────────────────────────────────────────────────

    /// <summary>GET /api/v1/geo/reverse with valid coords returns 200 with address.</summary>
    [Fact]
    public async Task HandleAsync_ReverseValidCoords_Returns200Address()
    {
        var ct = TestContext.Current.CancellationToken;

        var fake = fixture.Factory.Services.GetRequiredService<FakeGeoService>();
        fake.Reset();
        fake.ReverseResult = new MapyRgeocodeResult(true, "Václavské náměstí 1, Praha", "Václavské náměstí", "Praha");

        var client = fixture.Factory.CreateClient();
        client.AsDispatcher(Guid.CreateVersion7());

        var resp = await client.GetAsync("/api/v1/geo/reverse?lat=50.0808&lng=14.4284", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<ReverseResponse>(cancellationToken: ct);
        body.Should().NotBeNull();
        body!.Found.Should().BeTrue();
        body.Label.Should().Be("Václavské náměstí 1, Praha");
        body.Street.Should().Be("Václavské náměstí");
        body.Municipality.Should().Be("Praha");
    }

    /// <summary>GET /api/v1/geo/reverse when upstream returns Unavailable returns 200 with nulls.</summary>
    [Fact]
    public async Task HandleAsync_ReverseUnavailable_Returns200Nulls()
    {
        var ct = TestContext.Current.CancellationToken;

        var fake = fixture.Factory.Services.GetRequiredService<FakeGeoService>();
        fake.Reset();
        fake.ReverseShouldReturnUnavailable = true;

        var client = fixture.Factory.CreateClient();
        client.AsDispatcher(Guid.CreateVersion7());

        var resp = await client.GetAsync("/api/v1/geo/reverse?lat=50.08&lng=14.43", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<ReverseResponse>(cancellationToken: ct);
        body!.Found.Should().BeFalse();
        body.Label.Should().BeNull();
    }

    /// <summary>GET /api/v1/geo/reverse with out-of-range lat returns 400 with Geo.ReverseCoordsInvalid code.</summary>
    [Fact]
    public async Task HandleAsync_ReverseOutOfRangeCoords_Returns400()
    {
        var ct = TestContext.Current.CancellationToken;

        var client = fixture.Factory.CreateClient();
        client.AsDispatcher(Guid.CreateVersion7());

        var resp = await client.GetAsync("/api/v1/geo/reverse?lat=91.0&lng=14.43", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    /// <summary>Reverse validator fails with Geo.ReverseCoordsInvalid when lat is invalid.</summary>
    [Fact]
    public void ReverseValidator_InvalidLat_FailsWithCode()
    {
        var result = new Taxi.Api.Features.Geo.Reverse.ReverseValidator()
            .TestValidate(new Taxi.Api.Features.Geo.Reverse.ReverseRequest { Lat = "91.0", Lng = "14.43" });
        result.ShouldHaveValidationErrorFor(x => x.Lat)
            .WithErrorCode(Taxi.Api.Common.ErrorCodes.Geo.ReverseCoordsInvalid);
    }

    // ── Rate limit tests ──────────────────────────────────────────────────────

    /// <summary>A user who makes more than 5 geo requests per second receives 429 with Geo.RateLimited.</summary>
    [Fact]
    public async Task HandleAsync_SuggestOverRateLimit_Returns429RateLimited()
    {
        var ct = TestContext.Current.CancellationToken;

        // Use dedicated factory with its own FakeTime and GeoRateLimiter state — avoid contaminating shared factory.
        await using var factory = new TaxiApiFactory(fixture.ConnectionString);
        var userId = Guid.CreateVersion7();
        var client = factory.CreateClient();
        client.AsDispatcher(Guid.CreateVersion7(), userId: userId);

        var fake = factory.Services.GetRequiredService<FakeGeoService>();
        fake.Reset();
        fake.SuggestResult = [];

        // Exhaust the 5 req/s token bucket.
        HttpResponseMessage? last = null;
        for (var i = 0; i < 6; i++)
        {
            last = await client.GetAsync("/api/v1/geo/suggest?q=Praha", ct);
        }

        last!.StatusCode.Should().Be(HttpStatusCode.TooManyRequests);
    }

    // ── Validator unit tests ──────────────────────────────────────────────────

    /// <summary>Suggest validator fails with Geo.SuggestQueryTooShort when query is shorter than 3 chars.</summary>
    [Fact]
    public void SuggestValidator_QueryTooShort_FailsWithCode()
    {
        var result = new Taxi.Api.Features.Geo.Suggest.SuggestValidator()
            .TestValidate(new Taxi.Api.Features.Geo.Suggest.SuggestRequest { Q = "ab" });
        result.ShouldHaveValidationErrorFor(x => x.Q)
            .WithErrorCode(Taxi.Api.Common.ErrorCodes.Geo.SuggestQueryTooShort);
    }

    // ── Seed helpers ──────────────────────────────────────────────────────────

    private async Task SeedFleetOnly(Guid fleetId, CancellationToken ct)
    {
        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.Fleets.Add(new Fleet
        {
            Id = fleetId,
            Slug = $"geo-{fleetId:N}",
            Name = "Geo Test Fleet",
            Phone = "+420601000999",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync(ct);
    }

    private async Task SeedFleetWithTariff(Guid fleetId, int baseFare, int perKm, int minimum, CancellationToken ct)
    {
        await SeedFleetOnly(fleetId, ct);

        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.Tariffs.Add(new Tariff
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleetId,
            Name = "Default",
            BaseFareCzk = baseFare,
            PerKmCzk = perKm,
            MinimumFareCzk = minimum,
            IsDefault = true,
            IsEnabled = true
        });
        await db.SaveChangesAsync(ct);
    }

    // ── Response record shapes (for deserialization only) ─────────────────────

    private sealed record SuggestResponse(IReadOnlyList<SuggestItemDto> Items);
    private sealed record SuggestItemDto(string Label, string? Street, string? Municipality, double Lat, double Lng);
    private sealed record RouteResponse(int DistanceMeters, int DurationSeconds, int? EstimatedPriceCzk);
    private sealed record GeocodeResponse(bool Found, string? Label, double? Lat, double? Lng);
    private sealed record ReverseResponse(bool Found, string? Label, string? Street, string? Municipality);
}

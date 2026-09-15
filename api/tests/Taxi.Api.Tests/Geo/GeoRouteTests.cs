using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Infrastructure.Geo;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Geo;

/// <summary>Integration tests for POST /geo/route (WI-09).</summary>
[Collection(TestCollections.Database)]
public sealed class GeoRouteTests(PostgresFixture fixture)
{
    // ── Happy path ────────────────────────────────────────────────────────────

    /// <summary>POST /geo/route with valid body returns 200 with distance, duration, and geometry.</summary>
    [Fact]
    public async Task HandleAsync_PostRouteValidBody_ReturnsDistanceDurationGeometry()
    {
        var ct = TestContext.Current.CancellationToken;

        var fake = fixture.Factory.Services.GetRequiredService<FakeGeoService>();
        fake.Reset();
        fake.RouteResult = new MapyRouteResultData(5000, 600,
            [new MapyGeoPoint(50.08, 14.43), new MapyGeoPoint(50.09, 14.44)]);

        var client = fixture.Factory.CreateClient();
        client.AsDispatcher(Guid.CreateVersion7());

        var resp = await client.PostAsJsonAsync("/api/v1/geo/route",
            new { from = new { lat = 50.08, lng = 14.43 }, to = new { lat = 50.09, lng = 14.44 } },
            ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<PostRouteTestResponse>(cancellationToken: ct);
        body.Should().NotBeNull();
        body!.DistanceMeters.Should().Be(5000);
        body.DurationSeconds.Should().Be(600);
        body.Geometry.Should().NotBeNull();
        body.Geometry!.Should().HaveCount(2);
    }

    // ── Validation ───────────────────────────────────────────────────────────

    /// <summary>POST /geo/route with null-island (0,0) coordinates returns 400.</summary>
    [Fact]
    public async Task HandleAsync_RouteBodyZeroZero_Returns400()
    {
        var ct = TestContext.Current.CancellationToken;

        var client = fixture.Factory.CreateClient();
        client.AsDispatcher(Guid.CreateVersion7());

        var resp = await client.PostAsJsonAsync("/api/v1/geo/route",
            new { from = new { lat = 0.0, lng = 0.0 }, to = new { lat = 50.09, lng = 14.44 } },
            ct);

        resp.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    /// <summary>POST /geo/route with missing From object returns 400.</summary>
    [Fact]
    public async Task HandleAsync_RouteMissingFrom_Returns400()
    {
        var ct = TestContext.Current.CancellationToken;

        var client = fixture.Factory.CreateClient();
        client.AsDispatcher(Guid.CreateVersion7());

        var resp = await client.PostAsJsonAsync("/api/v1/geo/route",
            new { to = new { lat = 50.09, lng = 14.44 } },
            ct);

        resp.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    /// <summary>POST /geo/route when upstream Mapy.com is unavailable returns 502 with Geo.RouteUnavailable.</summary>
    [Fact]
    public async Task HandleAsync_RouteUpstreamUnavailable_Returns502()
    {
        var ct = TestContext.Current.CancellationToken;

        var fake = fixture.Factory.Services.GetRequiredService<FakeGeoService>();
        fake.Reset();
        fake.RouteShouldReturnUnavailable = true;

        var client = fixture.Factory.CreateClient();
        client.AsDispatcher(Guid.CreateVersion7());

        var resp = await client.PostAsJsonAsync("/api/v1/geo/route",
            new { from = new { lat = 50.08, lng = 14.43 }, to = new { lat = 50.09, lng = 14.44 } },
            ct);

        resp.StatusCode.Should().Be(HttpStatusCode.BadGateway);
    }

    // ── Helper type ───────────────────────────────────────────────────────────

    private sealed record PostRouteTestResponse(
        int DistanceMeters,
        int DurationSeconds,
        int? EstimatedPriceCzk,
        List<System.Text.Json.JsonElement>? Geometry);
}

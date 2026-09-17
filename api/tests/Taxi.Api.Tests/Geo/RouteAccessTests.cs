using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Common.Geo;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Infrastructure.Geo;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Geo;

/// <summary>Access-control tests for the geo/route endpoint.
/// After the anonymous-route change, AllowAnonymous + GeoRateLimiter guard replaces the DispatcherOrDriver policy.
/// Customers and anonymous callers with an X-Fleet-Slug header receive 200; rate-limited callers receive 429.</summary>
[Collection(TestCollections.Database)]
public sealed class RouteAccessTests(PostgresFixture fixture)
{
    private const string RouteUrl = "/api/v1/geo/route";
    private static readonly object RouteBody =
        new { from = new { lat = 50.08, lng = 14.43 }, to = new { lat = 50.09, lng = 14.44 } };

    private const string SuggestUrl = "/api/v1/geo/suggest?q=Prague";

    // ── Route endpoint ──────────────────────────────────────────────────────

    /// <summary>A Driver caller receives 200 from POST geo/route.</summary>
    [Fact]
    public async Task Route_Driver_Returns200()
    {
        var ct = TestContext.Current.CancellationToken;

        SetupFakeRoute();

        var client = fixture.Factory.CreateClient();
        client.AsDriver(Guid.CreateVersion7(), Guid.CreateVersion7());

        var resp = await client.PostAsJsonAsync(RouteUrl, RouteBody, ct);
        resp.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    /// <summary>A Dispatcher caller still receives 200 from POST geo/route.</summary>
    [Fact]
    public async Task Route_Dispatcher_StillReturns200()
    {
        var ct = TestContext.Current.CancellationToken;

        SetupFakeRoute();

        var client = fixture.Factory.CreateClient();
        client.AsDispatcher(Guid.CreateVersion7());

        var resp = await client.PostAsJsonAsync(RouteUrl, RouteBody, ct);
        resp.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    /// <summary>A Customer caller now receives 200 from POST geo/route (AllowAnonymous after route-anon change).</summary>
    [Fact]
    public async Task Route_Customer_Returns200()
    {
        var ct = TestContext.Current.CancellationToken;

        SetupFakeRoute();

        var client = fixture.Factory.CreateClient();
        client.AsCustomer();

        var resp = await client.PostAsJsonAsync(RouteUrl, RouteBody, ct);
        resp.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    /// <summary>An anonymous request with X-Fleet-Slug returns 200 with geometry (AC: logged-out customer can fetch route polyline).</summary>
    [Fact]
    public async Task Route_Anonymous_WithFleetSlug_Returns200WithGeometry()
    {
        var ct = TestContext.Current.CancellationToken;

        var fake = fixture.Factory.Services.GetRequiredService<FakeGeoService>();
        fake.Reset();
        // Use geometry with points so the endpoint returns non-null geometry.
        fake.RouteResult = new MapyRouteResultData(2000, 180,
        [
            new MapyGeoPoint(50.08, 14.43),
            new MapyGeoPoint(50.085, 14.435),
            new MapyGeoPoint(50.09, 14.44)
        ]);

        // Reset rate limiter to avoid contamination from other tests.
        fixture.Factory.Services.GetRequiredService<GeoRateLimiter>().Reset();

        var client = fixture.Factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Fleet-Slug", "demo");
        // No Authorization header — purely anonymous.

        var resp = await client.PostAsJsonAsync(RouteUrl, RouteBody, ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<RouteResponseBody>(cancellationToken: ct);
        body.Should().NotBeNull();
        body!.DistanceMeters.Should().Be(2000);
        body.DurationSeconds.Should().Be(180);
        body.Geometry.Should().NotBeNullOrEmpty("route geometry must be returned for the anonymous caller");
    }

    /// <summary>Anonymous callers are rate-limited to 5 req/s; the 6th request returns 429.
    /// Uses a dedicated TaxiApiFactory to avoid singleton GeoRateLimiter contamination.</summary>
    [Fact]
    public async Task Route_Anonymous_RateLimit_Fires()
    {
        var ct = TestContext.Current.CancellationToken;

        await using var factory = new TaxiApiFactory(fixture.ConnectionString);
        var limiter = factory.Services.GetRequiredService<GeoRateLimiter>();
        limiter.Reset();

        var fake = factory.Services.GetRequiredService<FakeGeoService>();
        fake.Reset();
        fake.RouteResult = new MapyRouteResultData(1000, 120, []);

        var client = factory.CreateClient();
        // No Authorization header, no X-Fleet-Slug — anonymous.

        HttpResponseMessage? last = null;
        for (var i = 0; i < 6; i++)
        {
            last = await client.PostAsJsonAsync(RouteUrl, RouteBody, ct);
        }

        last!.StatusCode.Should().Be(HttpStatusCode.TooManyRequests,
            "anonymous callers must be throttled at 5 req/s");
    }

    // ── Suggest endpoint (AllowAnonymous after UC-014 WI-1; all callers allowed) ──

    /// <summary>A Driver caller now receives 200 from geo/suggest (AllowAnonymous — any caller is allowed).</summary>
    [Fact]
    public async Task Suggest_Driver_Returns200()
    {
        var ct = TestContext.Current.CancellationToken;
        SetupFakeSuggest();

        var client = fixture.Factory.CreateClient();
        client.AsDriver(Guid.CreateVersion7(), Guid.CreateVersion7());

        var resp = await client.GetAsync(SuggestUrl, ct);
        resp.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private void SetupFakeRoute()
    {
        var fake = fixture.Factory.Services.GetRequiredService<FakeGeoService>();
        fake.Reset();
        fake.RouteResult = new MapyRouteResultData(1000, 120, []);
        fixture.Factory.Services.GetRequiredService<GeoRateLimiter>().Reset();
    }

    private void SetupFakeSuggest()
    {
        var fake = fixture.Factory.Services.GetRequiredService<FakeGeoService>();
        fake.Reset();
        fake.SuggestResult = [new MapySuggestResult("Prague", null, null, 50.08, 14.43)];
    }

    // ── Response record shape (deserialization) ───────────────────────────────

    private sealed record RouteResponseBody(int DistanceMeters, int DurationSeconds, int? EstimatedPriceCzk, IReadOnlyList<double[]>? Geometry);
}

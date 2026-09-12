using System.Net;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Infrastructure.Geo;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Geo;

/// <summary>Access-control tests for the geo/route endpoint after A-geo changes
/// (DispatcherOrDriver policy) and for geo/suggest (still DispatcherOnly).</summary>
[Collection(TestCollections.Database)]
public sealed class RouteAccessTests(PostgresFixture fixture)
{
    private const string RouteUrl =
        "/api/v1/geo/route?fromLat=50.08&fromLng=14.43&toLat=50.09&toLng=14.44";

    private const string SuggestUrl = "/api/v1/geo/suggest?q=Prague";

    // ── Route endpoint ──────────────────────────────────────────────────────

    /// <summary>A Driver caller receives 200 from geo/route (DispatcherOrDriver policy).</summary>
    [Fact]
    public async Task Route_Driver_Returns200()
    {
        var ct = TestContext.Current.CancellationToken;

        SetupFakeRoute();

        var client = fixture.Factory.CreateClient();
        client.AsDriver(Guid.CreateVersion7(), Guid.CreateVersion7());

        var resp = await client.GetAsync(RouteUrl, ct);
        resp.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    /// <summary>A Dispatcher caller still receives 200 from geo/route.</summary>
    [Fact]
    public async Task Route_Dispatcher_StillReturns200()
    {
        var ct = TestContext.Current.CancellationToken;

        SetupFakeRoute();

        var client = fixture.Factory.CreateClient();
        client.AsDispatcher(Guid.CreateVersion7());

        var resp = await client.GetAsync(RouteUrl, ct);
        resp.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    /// <summary>A Customer caller receives 403 from geo/route.</summary>
    [Fact]
    public async Task Route_Customer_Returns403()
    {
        var ct = TestContext.Current.CancellationToken;

        var client = fixture.Factory.CreateClient();
        client.AsCustomer();

        var resp = await client.GetAsync(RouteUrl, ct);
        resp.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    // ── Suggest endpoint (still DispatcherOnly) ──────────────────────────────

    /// <summary>A Driver caller receives 403 from geo/suggest (suggest remains DispatcherOnly).</summary>
    [Fact]
    public async Task Suggest_Driver_Returns403()
    {
        var ct = TestContext.Current.CancellationToken;

        var client = fixture.Factory.CreateClient();
        client.AsDriver(Guid.CreateVersion7(), Guid.CreateVersion7());

        var resp = await client.GetAsync(SuggestUrl, ct);
        resp.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    // ── Helper ───────────────────────────────────────────────────────────────

    private void SetupFakeRoute()
    {
        var fake = fixture.Factory.Services.GetRequiredService<FakeGeoProvider>();
        fake.Reset();
        fake.RouteResult = new GeoRouteResult(1000, 120);
    }
}

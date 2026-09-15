using System.Net;
using System.Net.Http.Json;
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
    private const string RouteUrl = "/api/v1/geo/route";
    private static readonly object RouteBody =
        new { from = new { lat = 50.08, lng = 14.43 }, to = new { lat = 50.09, lng = 14.44 } };

    private const string SuggestUrl = "/api/v1/geo/suggest?q=Prague";

    // ── Route endpoint ──────────────────────────────────────────────────────

    /// <summary>A Driver caller receives 200 from POST geo/route (DispatcherOrDriver policy).</summary>
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

    /// <summary>A Customer caller receives 403 from POST geo/route.</summary>
    [Fact]
    public async Task Route_Customer_Returns403()
    {
        var ct = TestContext.Current.CancellationToken;

        var client = fixture.Factory.CreateClient();
        client.AsCustomer();

        var resp = await client.PostAsJsonAsync(RouteUrl, RouteBody, ct);
        resp.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    // ── Suggest endpoint (CustomerOrStaff after A-geo-suggest; drivers excluded) ──

    /// <summary>A Driver caller receives 403 from geo/suggest (CustomerOrStaff excludes drivers).</summary>
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
        var fake = fixture.Factory.Services.GetRequiredService<FakeGeoService>();
        fake.Reset();
        fake.RouteResult = new MapyRouteResultData(1000, 120, []);
    }
}

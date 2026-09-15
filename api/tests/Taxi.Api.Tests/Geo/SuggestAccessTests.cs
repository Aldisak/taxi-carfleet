using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Infrastructure.Geo;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Geo;

/// <summary>Access-control tests for geo/suggest after A-geo-suggest widened it to the
/// CustomerOrStaff policy, and confirmation that geo/route is NOT widened to customers.</summary>
[Collection(TestCollections.Database)]
public sealed class SuggestAccessTests(PostgresFixture fixture)
{
    private const string SuggestUrl = "/api/v1/geo/suggest?q=Prague";

    private const string RouteUrl = "/api/v1/geo/route";
    private static readonly object RouteBody =
        new { from = new { lat = 50.08, lng = 14.43 }, to = new { lat = 50.09, lng = 14.44 } };

    private void SetupFakeSuggest()
    {
        var fake = fixture.Factory.Services.GetRequiredService<FakeGeoService>();
        fake.Reset();
        fake.SuggestResult = [new MapySuggestResult("Prague, CZ", null, null, 50.08, 14.43)];
    }

    /// <summary>A Customer caller now receives 200 from geo/suggest.</summary>
    [Fact]
    public async Task Suggest_Customer_Returns200()
    {
        var ct = TestContext.Current.CancellationToken;
        SetupFakeSuggest();

        var client = fixture.Factory.CreateClient();
        client.AsCustomer();

        var resp = await client.GetAsync(SuggestUrl, ct);
        resp.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    /// <summary>A Dispatcher caller still receives 200 from geo/suggest (regression).</summary>
    [Fact]
    public async Task Suggest_Dispatcher_StillReturns200()
    {
        var ct = TestContext.Current.CancellationToken;
        SetupFakeSuggest();

        var client = fixture.Factory.CreateClient();
        client.AsDispatcher(Guid.CreateVersion7());

        var resp = await client.GetAsync(SuggestUrl, ct);
        resp.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    /// <summary>A Driver caller receives 403 from geo/suggest (drivers excluded from CustomerOrStaff).</summary>
    [Fact]
    public async Task Suggest_Driver_Returns403()
    {
        var ct = TestContext.Current.CancellationToken;

        var client = fixture.Factory.CreateClient();
        client.AsDriver(Guid.CreateVersion7(), Guid.CreateVersion7());

        var resp = await client.GetAsync(SuggestUrl, ct);
        resp.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    /// <summary>A Customer caller receives 403 from POST geo/route (route is NOT widened to customers).</summary>
    [Fact]
    public async Task Route_Customer_Returns403()
    {
        var ct = TestContext.Current.CancellationToken;

        var client = fixture.Factory.CreateClient();
        client.AsCustomer();

        var resp = await client.PostAsJsonAsync(RouteUrl, RouteBody, ct);
        resp.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }
}

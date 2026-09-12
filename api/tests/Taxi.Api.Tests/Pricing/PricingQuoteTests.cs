using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Features.Pricing.Quote;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Infrastructure.Geo;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Pricing;

/// <summary>Integration tests for GET pricing/quote (A-pricing) — fixed-price route match,
/// estimate range (never exact), no dropoff, invalid coords, tenant isolation, OSRM failure.</summary>
[Collection(TestCollections.Database)]
public sealed class PricingQuoteTests(PostgresFixture fixture)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private static Fleet BuildFleet(string slugSuffix) => new()
    {
        Id = Guid.CreateVersion7(),
        Slug = $"price-{slugSuffix}",
        Name = $"Price Fleet {slugSuffix}",
        Phone = "+420605000001",
        Currency = "CZK",
        TimeZone = "Europe/Prague",
        IsActive = true,
        CreatedAt = DateTimeOffset.UtcNow
    };

    private static Tariff BuildTariff(Guid fleetId) => new()
    {
        Id = Guid.CreateVersion7(),
        FleetId = fleetId,
        Name = "Default",
        BaseFareCzk = 40,
        PerKmCzk = 30,
        PerMinuteWaitingCzk = 6,
        MinimumFareCzk = 60,
        IsDefault = true,
        IsEnabled = true
    };

    private static Route BuildPointToPointRoute(Guid fleetId,
        double fromLat, double fromLng, double toLat, double toLng, int price) => new()
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleetId,
            Name = "Airport",
            Type = RouteType.PointToPoint,
            PriceCzk = price,
            FromLat = fromLat,
            FromLng = fromLng,
            ToLat = toLat,
            ToLng = toLng,
            ValidDays = 127, // all days
            Priority = 10,
            IsEnabled = true
        };

    private async Task SeedAsync(Fleet fleet, params object[] tenantEntities)
    {
        var ct = TestContext.Current.CancellationToken;
        using var scope = fixture.Factory.Services.CreateScope();
        var tenant = scope.ServiceProvider.GetRequiredService<CurrentTenant>();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.Fleets.Add(fleet);
        await db.SaveChangesAsync(ct);
        tenant.FleetId = fleet.Id;
        foreach (var e in tenantEntities) db.Add(e);
        await db.SaveChangesAsync(ct);
    }

    private void SetFakeRoute(int distanceMeters)
    {
        var fake = fixture.Factory.Services.GetRequiredService<FakeGeoProvider>();
        fake.Reset(); // clear any leaked RouteShouldThrow / stale result from a prior test (shared singleton)
        fake.RouteResult = new GeoRouteResult(distanceMeters, 600);
    }

    private void SetRouteThrows()
    {
        var fake = fixture.Factory.Services.GetRequiredService<FakeGeoProvider>();
        fake.Reset();
        fake.RouteShouldThrow = true;
    }

    private HttpClient CustomerClient(Fleet fleet)
    {
        var client = fixture.Factory.CreateClient();
        client.AsCustomer();
        client.DefaultRequestHeaders.Add("X-Fleet-Slug", fleet.Slug);
        return client;
    }

    /// <summary>A request matching a PointToPoint route returns a fixed price.</summary>
    [Fact]
    public async Task Quote_RouteMatch_ReturnsFixed()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var fleet = BuildFleet(suffix);
        var route = BuildPointToPointRoute(fleet.Id, 50.08, 14.43, 50.10, 14.26, 450);
        await SeedAsync(fleet, BuildTariff(fleet.Id), route);

        var client = CustomerClient(fleet);
        var resp = await client.GetAsync(
            "api/v1/pricing/quote?fromLat=50.08&fromLng=14.43&toLat=50.10&toLng=14.26", ct);
        resp.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await resp.Content.ReadFromJsonAsync<QuoteResponse>(JsonOptions, ct);
        body!.PriceType.Should().Be("Fixed");
        body.FixedPriceCzk.Should().Be(450);
        body.EstimateLowCzk.Should().BeNull();
    }

    /// <summary>No route match → an estimate range, never a single exact number.</summary>
    [Fact]
    public async Task Quote_NoRoute_ReturnsEstimateRange_NeverExact()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var fleet = BuildFleet(suffix);
        await SeedAsync(fleet, BuildTariff(fleet.Id));
        SetFakeRoute(8000); // 8 km

        var client = CustomerClient(fleet);
        var resp = await client.GetAsync(
            "api/v1/pricing/quote?fromLat=49.10&fromLng=13.10&toLat=49.20&toLng=13.20", ct);
        resp.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await resp.Content.ReadFromJsonAsync<QuoteResponse>(JsonOptions, ct);
        body!.PriceType.Should().Be("Estimate");
        body.FixedPriceCzk.Should().BeNull();
        body.EstimateLowCzk.Should().NotBeNull();
        body.EstimateHighCzk.Should().NotBeNull();
        body.EstimateLowCzk!.Value.Should().BeLessThan(body.EstimateHighCzk!.Value,
            "an estimate must be a range, never a single exact value (AC #4)");
    }

    /// <summary>The estimate band is the tariff price +/- 10% rounded to 10 CZK.</summary>
    [Fact]
    public async Task Quote_EstimateBand_IsTariffPricePlusMinus10RoundedTo10()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var fleet = BuildFleet(suffix);
        await SeedAsync(fleet, BuildTariff(fleet.Id));
        // 10 km → price = Max(60, round(40 + 30*10)) = 340.
        SetFakeRoute(10000);

        var client = CustomerClient(fleet);
        var resp = await client.GetAsync(
            "api/v1/pricing/quote?fromLat=49.30&fromLng=13.30&toLat=49.40&toLng=13.40", ct);
        resp.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await resp.Content.ReadFromJsonAsync<QuoteResponse>(JsonOptions, ct);
        // price 340: low = round(306)→310, high = round(374)→370.
        body!.EstimateLowCzk.Should().Be(310);
        body.EstimateHighCzk.Should().Be(370);
    }

    /// <summary>Missing dropoff returns a wide estimate (no upstream call).</summary>
    [Fact]
    public async Task Quote_NoDropoff_ReturnsWideEstimate()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var fleet = BuildFleet(suffix);
        await SeedAsync(fleet, BuildTariff(fleet.Id));

        var client = CustomerClient(fleet);
        var resp = await client.GetAsync("api/v1/pricing/quote?fromLat=50.08&fromLng=14.43", ct);
        resp.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await resp.Content.ReadFromJsonAsync<QuoteResponse>(JsonOptions, ct);
        body!.PriceType.Should().Be("Estimate");
        body.EstimateLowCzk!.Value.Should().BeLessThan(body.EstimateHighCzk!.Value);
    }

    /// <summary>Invalid (non-numeric) coords → 400.</summary>
    [Fact]
    public async Task Quote_InvalidCoords_Returns400()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var fleet = BuildFleet(suffix);
        await SeedAsync(fleet, BuildTariff(fleet.Id));

        var client = CustomerClient(fleet);
        var resp = await client.GetAsync("api/v1/pricing/quote?fromLat=abc&fromLng=14.43", ct);
        resp.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    /// <summary>A fleet-A customer's quote prices from fleet A's tariff only — fleet B's route
    /// rule must not apply (tenant isolation).</summary>
    [Fact]
    public async Task Quote_CrossTenant_UsesCallerFleetTariffOnly()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffixA = Guid.NewGuid().ToString("N")[..8];
        var suffixB = Guid.NewGuid().ToString("N")[..8];
        var fleetA = BuildFleet(suffixA);
        var fleetB = BuildFleet(suffixB);

        // Seed fleet A (tariff only) and fleet B (a matching fixed route for the SAME coords).
        using (var scope = fixture.Factory.Services.CreateScope())
        {
            var tenant = scope.ServiceProvider.GetRequiredService<CurrentTenant>();
            var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
            db.Fleets.Add(fleetA);
            db.Fleets.Add(fleetB);
            await db.SaveChangesAsync(ct);
            tenant.FleetId = fleetA.Id;
            db.Tariffs.Add(BuildTariff(fleetA.Id));
            await db.SaveChangesAsync(ct);
            tenant.FleetId = fleetB.Id;
            db.Routes.Add(BuildPointToPointRoute(fleetB.Id, 50.08, 14.43, 50.10, 14.26, 999));
            await db.SaveChangesAsync(ct);
        }

        SetFakeRoute(5000);

        var client = CustomerClient(fleetA);
        var resp = await client.GetAsync(
            "api/v1/pricing/quote?fromLat=50.08&fromLng=14.43&toLat=50.10&toLng=14.26", ct);
        resp.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await resp.Content.ReadFromJsonAsync<QuoteResponse>(JsonOptions, ct);
        body!.PriceType.Should().Be("Estimate",
            "fleet B's fixed route must not apply to fleet A's quote");
        body.FixedPriceCzk.Should().BeNull();
    }

    /// <summary>OSRM upstream failure → 502 Geo.RouteUnavailable.</summary>
    [Fact]
    public async Task Quote_OsrmDown_Returns502()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var fleet = BuildFleet(suffix);
        await SeedAsync(fleet, BuildTariff(fleet.Id));
        SetRouteThrows();

        var client = CustomerClient(fleet);
        var resp = await client.GetAsync(
            "api/v1/pricing/quote?fromLat=49.50&fromLng=13.50&toLat=49.60&toLng=13.60", ct);
        resp.StatusCode.Should().Be(HttpStatusCode.BadGateway);

        // Reset for other tests sharing the fixture.
        fixture.Factory.Services.GetRequiredService<FakeGeoProvider>().Reset();
    }
}

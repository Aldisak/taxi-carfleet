using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Features.Pricing.Quote;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Infrastructure.Geo;
using Taxi.Api.Infrastructure.Seed;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Pricing;

/// <summary>Integration tests for POST pricing/quote (A6) — the route matcher against seeded KH/Kolín
/// data (AC#2), Meter fallback, access widening (anonymous-by-slug + any authenticated role), tenant
/// isolation, and OSRM failure.</summary>
[Collection(TestCollections.Database)]
public sealed class PricingQuoteTests(PostgresFixture fixture)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    // ── Seeded-fleet (demo) AC#2 coordinates ───────────────────────────────────
    private const double KhStationLat = 49.9556;
    private const double KhStationLng = 15.2731;
    private const double KhCenterLat = 49.9481;
    private const double KhCenterLng = 15.2681;
    private const double KolinLat = 50.0281;
    private const double KolinLng = 15.2006;

    private async Task EnsureDemoAsync()
    {
        var ct = TestContext.Current.CancellationToken;
        using var scope = fixture.Factory.Services.CreateScope();
        var seeder = scope.ServiceProvider.GetRequiredService<DevelopmentSeeder>();
        await seeder.SeedAsync(ct);
    }

    private void SetFakeRoute(int distanceMeters)
    {
        var fake = fixture.Factory.Services.GetRequiredService<FakeGeoProvider>();
        fake.Reset();
        fake.RouteResult = new GeoRouteResult(distanceMeters, 900);
    }

    private HttpClient DemoAnonymousClient()
    {
        var client = fixture.Factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Fleet-Slug", "demo");
        return client;
    }

    private static async Task<QuoteResponse> PostQuoteAsync(HttpClient client, object body)
    {
        var ct = TestContext.Current.CancellationToken;
        var resp = await client.PostAsJsonAsync("api/v1/pricing/quote", body, ct);
        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        return (await resp.Content.ReadFromJsonAsync<QuoteResponse>(JsonOptions, ct))!;
    }

    // ── AC#2 seeded scenarios ───────────────────────────────────────────────────

    /// <summary>KH station → KH centre returns the seeded Fixed 100 PointToPoint route.</summary>
    [Fact]
    public async Task Quote_KHStationToCenter_ReturnsFixed100()
    {
        await EnsureDemoAsync();
        var body = await PostQuoteAsync(DemoAnonymousClient(), new
        {
            pickupLat = KhStationLat,
            pickupLng = KhStationLng,
            dropoffLat = KhCenterLat,
            dropoffLng = KhCenterLng
        });
        body.Type.Should().Be("Fixed");
        body.PriceCzk.Should().Be(100);
        body.RouteId.Should().NotBeNull();
    }

    /// <summary>Anywhere in KH with NO dropoff returns the seeded Zone Fixed 110 (matches on pickup alone).</summary>
    [Fact]
    public async Task Quote_AnywhereInKH_ReturnsFixed110()
    {
        await EnsureDemoAsync();
        // A point inside the KH zone but NOT within the P2P station radius, no dropoff.
        var body = await PostQuoteAsync(DemoAnonymousClient(), new
        {
            pickupLat = 49.9400,
            pickupLng = 15.2600
        });
        body.Type.Should().Be("Fixed");
        body.PriceCzk.Should().Be(110, "a Zone route matches on pickup-in-zone alone, no dropoff");
    }

    /// <summary>KH ↔ Kolín returns the seeded Fixed 300 ZoneToZone route in BOTH directions (bidirectional).</summary>
    [Fact]
    public async Task Quote_KHToKolin_ReturnsFixed300_BothDirections()
    {
        await EnsureDemoAsync();
        var khToKolin = await PostQuoteAsync(DemoAnonymousClient(), new
        {
            pickupLat = KhCenterLat,
            pickupLng = KhCenterLng,
            dropoffLat = KolinLat,
            dropoffLng = KolinLng
        });
        khToKolin.Type.Should().Be("Fixed");
        khToKolin.PriceCzk.Should().Be(300);

        var kolinToKh = await PostQuoteAsync(DemoAnonymousClient(), new
        {
            pickupLat = KolinLat,
            pickupLng = KolinLng,
            dropoffLat = KhCenterLat,
            dropoffLng = KhCenterLng
        });
        kolinToKh.Type.Should().Be("Fixed");
        kolinToKh.PriceCzk.Should().Be(300, "the ZoneToZone route is bidirectional");
    }

    /// <summary>Kolín → Prague (no matching route, dropoff known) returns an Estimate range (low &lt; high).</summary>
    [Fact]
    public async Task Quote_KolinToPrague_ReturnsEstimateRange()
    {
        await EnsureDemoAsync();
        SetFakeRoute(60_000); // ~60 km Kolín→Prague

        var body = await PostQuoteAsync(DemoAnonymousClient(), new
        {
            pickupLat = KolinLat,
            pickupLng = KolinLng,
            dropoffLat = 50.0755,
            dropoffLng = 14.4378 // Prague
        });
        body.Type.Should().Be("Estimate");
        body.LowCzk.Should().NotBeNull();
        body.HighCzk.Should().NotBeNull();
        body.LowCzk!.Value.Should().BeLessThan(body.HighCzk!.Value, "an estimate is a range, never exact");
        body.DistanceKm.Should().BeApproximately(60.0, 0.1);
    }

    /// <summary>Outside all zones with no dropoff returns a Meter tariff summary.</summary>
    [Fact]
    public async Task Quote_OutsideAllZonesNoDropoff_ReturnsMeter()
    {
        await EnsureDemoAsync();
        var body = await PostQuoteAsync(DemoAnonymousClient(), new
        {
            pickupLat = 50.0755, // Prague — outside KH and Kolín zones
            pickupLng = 14.4378
        });
        body.Type.Should().Be("Meter");
        body.BaseCzk.Should().Be(40);
        body.PerKmCzk.Should().Be(28);
        body.MinimumCzk.Should().Be(100);
    }

    /// <summary>The seeded night-only route (valid 03:00-04:00 Prague, priority 50) is matched when the
    /// caller passes <c>at</c> inside that window — exercises JSON binding of <c>at</c>, the seeded night
    /// route, and within-type priority (200 beats base Zone 110) end-to-end (the B3 Otestovat path).</summary>
    [Fact]
    public async Task Quote_AtNightWindow_ReturnsSeededNightRoute()
    {
        await EnsureDemoAsync();
        // 2026-09-11 01:30 UTC = 03:30 CEST — inside the 03:00-04:00 night window.
        var body = await PostQuoteAsync(DemoAnonymousClient(), new
        {
            pickupLat = 49.9400,
            pickupLng = 15.2600,
            at = "2026-09-11T01:30:00Z"
        });
        body.Type.Should().Be("Fixed");
        body.PriceCzk.Should().Be(200, "the night route (priority 50) beats the base Zone route (110, priority 5) in its window");
    }

    /// <summary>The estimate band is tariff price ±10% rounded to 10 CZK (precise assertion).
    /// demo tariff: Base 40, PerKm 28, Minimum 100. 10 km → ceil(40+280)=320 roundUp10=320;
    /// low=round(288)=290, high=round(352)=350.</summary>
    [Fact]
    public async Task Quote_EstimateBand_IsTariffPricePlusMinus10RoundedTo10()
    {
        await EnsureDemoAsync();
        SetFakeRoute(10_000); // 10 km

        var body = await PostQuoteAsync(DemoAnonymousClient(), new
        {
            pickupLat = 50.0755, // Prague — no route match, dropoff known → Estimate
            pickupLng = 14.4378,
            dropoffLat = 50.0800,
            dropoffLng = 14.5000
        });
        body.Type.Should().Be("Estimate");
        body.LowCzk.Should().Be(290);
        body.HighCzk.Should().Be(350);
    }

    // ── Access widening ─────────────────────────────────────────────────────────

    /// <summary>An anonymous caller with only the fleet slug gets a 200 quote.</summary>
    [Fact]
    public async Task Quote_Anonymous_BySlug_Returns200()
    {
        await EnsureDemoAsync();
        var resp = await DemoAnonymousClient().PostAsJsonAsync("api/v1/pricing/quote", new
        {
            pickupLat = KhStationLat,
            pickupLng = KhStationLng
        }, TestContext.Current.CancellationToken);
        resp.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    /// <summary>A dispatcher (the Otestovat panel) gets a 200 quote.</summary>
    [Fact]
    public async Task Quote_Dispatcher_Returns200()
    {
        var ct = TestContext.Current.CancellationToken;
        await EnsureDemoAsync();
        Guid fleetId;
        using (var scope = fixture.Factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
            fleetId = (await db.Fleets.AsNoTracking()
                .FirstAsync(f => f.Slug == "demo", ct)).Id;
        }

        var client = fixture.Factory.CreateClient().AsDispatcher(fleetId, fleetSlug: "demo");
        var resp = await client.PostAsJsonAsync("api/v1/pricing/quote", new
        {
            pickupLat = KhStationLat,
            pickupLng = KhStationLng,
            dropoffLat = KhCenterLat,
            dropoffLng = KhCenterLng
        }, ct);
        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<QuoteResponse>(JsonOptions, ct);
        body!.Type.Should().Be("Fixed");
    }

    // ── Tenant isolation + failure ──────────────────────────────────────────────

    /// <summary>A fleet-A caller's quote prices from fleet A's routes only — fleet B's matching route
    /// must not apply (tenant isolation).</summary>
    [Fact]
    public async Task Quote_CrossTenant_UsesCallerFleetOnly()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffixA = Guid.NewGuid().ToString("N")[..8];
        var suffixB = Guid.NewGuid().ToString("N")[..8];
        var fleetA = BuildFleet(suffixA);
        var fleetB = BuildFleet(suffixB);

        using (var scope = fixture.Factory.Services.CreateScope())
        {
            var tenant = scope.ServiceProvider.GetRequiredService<CurrentTenant>();
            var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
            db.Fleets.AddRange(fleetA, fleetB);
            await db.SaveChangesAsync(ct);
            // Fleet A: default tariff only (no routes).
            tenant.FleetId = fleetA.Id;
            db.Tariffs.Add(BuildTariff(fleetA.Id));
            await db.SaveChangesAsync(ct);
            // Fleet B: a P2P route that would match the same coords.
            tenant.FleetId = fleetB.Id;
            db.Routes.Add(new Route
            {
                Id = Guid.CreateVersion7(),
                FleetId = fleetB.Id,
                Name = "FleetBRoute",
                Type = RouteType.PointToPoint,
                PriceCzk = 999,
                FromLat = 49.95,
                FromLng = 15.27,
                ToLat = 50.00,
                ToLng = 15.20,
                FromRadiusMeters = 2000,
                ToRadiusMeters = 2000,
                ValidDays = 127,
                Priority = 10,
                IsEnabled = true
            });
            await db.SaveChangesAsync(ct);
        }

        SetFakeRoute(5000);

        var client = fixture.Factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Fleet-Slug", fleetA.Slug);
        var body = await PostQuoteAsync(client, new
        {
            pickupLat = 49.95,
            pickupLng = 15.27,
            dropoffLat = 50.00,
            dropoffLng = 15.20
        });
        body.Type.Should().NotBe("Fixed", "fleet B's route must not apply to fleet A's quote");
    }

    /// <summary>OSRM upstream failure (dropoff known, no route) → 502 Geo.RouteUnavailable.</summary>
    [Fact]
    public async Task Quote_OsrmDown_Returns502()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var fleet = BuildFleet(suffix);
        using (var scope = fixture.Factory.Services.CreateScope())
        {
            var tenant = scope.ServiceProvider.GetRequiredService<CurrentTenant>();
            var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
            db.Fleets.Add(fleet);
            await db.SaveChangesAsync(ct);
            tenant.FleetId = fleet.Id;
            db.Tariffs.Add(BuildTariff(fleet.Id));
            await db.SaveChangesAsync(ct);
        }

        var fake = fixture.Factory.Services.GetRequiredService<FakeGeoProvider>();
        fake.Reset();
        fake.RouteShouldThrow = true;

        var client = fixture.Factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Fleet-Slug", fleet.Slug);
        var resp = await client.PostAsJsonAsync("api/v1/pricing/quote", new
        {
            pickupLat = 49.50,
            pickupLng = 13.50,
            dropoffLat = 49.60,
            dropoffLng = 13.60
        }, ct);
        resp.StatusCode.Should().Be(HttpStatusCode.BadGateway);

        fixture.Factory.Services.GetRequiredService<FakeGeoProvider>().Reset();
    }

    /// <summary>No fleet resolved (no slug, no auth) → 400.</summary>
    [Fact]
    public async Task Quote_NoFleetResolved_Returns400()
    {
        var ct = TestContext.Current.CancellationToken;
        var client = fixture.Factory.CreateClient();
        var resp = await client.PostAsJsonAsync("api/v1/pricing/quote", new
        {
            pickupLat = 49.95,
            pickupLng = 15.27
        }, ct);
        resp.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

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
}

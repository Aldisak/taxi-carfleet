using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using FluentValidation.TestHelper;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Features.Routes.ListCommonRoutes;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Routes;

/// <summary>Integration tests for GET routes/common (A-common-routes) — valid-now filtering,
/// soft-delete exclusion, tenant isolation. FakeTime is 2026-09-10 12:00 UTC = 14:00 Europe/Prague (Thursday).</summary>
[Collection(TestCollections.Database)]
public sealed class CommonRoutesTests(PostgresFixture fixture)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private static Fleet BuildFleet(string slugSuffix) => new()
    {
        Id = Guid.CreateVersion7(),
        Slug = $"croutes-{slugSuffix}",
        Name = $"Routes Fleet {slugSuffix}",
        Phone = "+420605000001",
        Currency = "CZK",
        TimeZone = "Europe/Prague",
        IsActive = true,
        CreatedAt = DateTimeOffset.UtcNow
    };

    private static Route BuildRoute(Guid fleetId, string name, int price, int validDays,
        TimeOnly? from = null, TimeOnly? to = null, bool enabled = true, DateTimeOffset? deletedAt = null,
        int priority = 0, double? toLat = 50.10, double? toLng = 14.26) => new()
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleetId,
            Name = name,
            Type = RouteType.PointToPoint,
            PriceCzk = price,
            FromLat = 50.08,
            FromLng = 14.43,
            ToLat = toLat,
            ToLng = toLng,
            ValidDays = validDays,
            ValidFromTime = from,
            ValidToTime = to,
            Priority = priority,
            IsEnabled = enabled,
            DeletedAt = deletedAt
        };

    private async Task SeedAsync(Fleet fleet, params Route[] routes)
    {
        var ct = TestContext.Current.CancellationToken;
        using var scope = fixture.Factory.Services.CreateScope();
        var tenant = scope.ServiceProvider.GetRequiredService<CurrentTenant>();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.Fleets.Add(fleet);
        await db.SaveChangesAsync(ct);
        tenant.FleetId = fleet.Id;
        foreach (var r in routes) db.Routes.Add(r);
        await db.SaveChangesAsync(ct);
    }

    // routes/common is anonymous (AC#1: logged-out visitor sees common routes on Home).
    // Fleet is resolved from X-Fleet-Slug by TenantResolutionMiddleware for anonymous requests,
    // exactly like public/fleet + public/track. No AsCustomer() auth header.
    private HttpClient AnonymousClient(Fleet fleet)
    {
        var client = fixture.Factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Fleet-Slug", fleet.Slug);
        return client;
    }

    private static async Task<ListCommonRoutesResponse> GetAsync(HttpClient client)
    {
        var ct = TestContext.Current.CancellationToken;
        var resp = await client.GetAsync("api/v1/routes/common?validNow=true", ct);
        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        return (await resp.Content.ReadFromJsonAsync<ListCommonRoutesResponse>(JsonOptions, ct))!;
    }

    /// <summary>Only enabled, valid-now routes are returned; out-of-window ones are excluded.</summary>
    [Fact]
    public async Task CommonRoutes_ReturnsOnlyValidNowEnabled()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var fleet = BuildFleet(suffix);
        // Valid now: all days, all day. Out of window: morning-only (08:00-10:00).
        var validAllDay = BuildRoute(fleet.Id, "AllDay", 300, 127, priority: 5);
        var morningOnly = BuildRoute(fleet.Id, "Morning", 200, 127,
            new TimeOnly(8, 0), new TimeOnly(10, 0), priority: 3);
        var disabled = BuildRoute(fleet.Id, "Disabled", 150, 127, enabled: false, priority: 1);
        await SeedAsync(fleet, validAllDay, morningOnly, disabled);

        var body = await GetAsync(AnonymousClient(fleet));
        body.Routes.Select(r => r.Name).Should().Contain("AllDay");
        body.Routes.Select(r => r.Name).Should().NotContain("Morning", "14:00 is outside the 08:00-10:00 window");
        body.Routes.Select(r => r.Name).Should().NotContain("Disabled");
    }

    /// <summary>A route whose day bit excludes today is not returned.</summary>
    [Fact]
    public async Task CommonRoutes_OutOfWindow_Excluded()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var fleet = BuildFleet(suffix);
        // Monday-only (bit 1); today (fake clock) is Thursday (bit 8) → excluded.
        var mondayOnly = BuildRoute(fleet.Id, "MondayOnly", 300, 1);
        await SeedAsync(fleet, mondayOnly);

        var body = await GetAsync(AnonymousClient(fleet));
        body.Routes.Select(r => r.Name).Should().NotContain("MondayOnly");
    }

    /// <summary>Soft-deleted routes are never returned.</summary>
    [Fact]
    public async Task CommonRoutes_Deleted_Excluded()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var fleet = BuildFleet(suffix);
        var deleted = BuildRoute(fleet.Id, "DeletedRoute", 300, 127, deletedAt: DateTimeOffset.UtcNow);
        var live = BuildRoute(fleet.Id, "LiveRoute", 300, 127);
        await SeedAsync(fleet, deleted, live);

        var body = await GetAsync(AnonymousClient(fleet));
        body.Routes.Select(r => r.Name).Should().Contain("LiveRoute");
        body.Routes.Select(r => r.Name).Should().NotContain("DeletedRoute");
    }

    /// <summary>Another fleet's routes never appear (tenant isolation).</summary>
    [Fact]
    public async Task CommonRoutes_CrossTenant_ReturnsOwnFleetOnly()
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
            db.Fleets.Add(fleetA);
            db.Fleets.Add(fleetB);
            await db.SaveChangesAsync(ct);
            tenant.FleetId = fleetA.Id;
            db.Routes.Add(BuildRoute(fleetA.Id, "FleetARoute", 300, 127));
            await db.SaveChangesAsync(ct);
            tenant.FleetId = fleetB.Id;
            db.Routes.Add(BuildRoute(fleetB.Id, "FleetBRoute", 300, 127));
            await db.SaveChangesAsync(ct);
        }

        var body = await GetAsync(AnonymousClient(fleetA));
        body.Routes.Select(r => r.Name).Should().Contain("FleetARoute");
        body.Routes.Select(r => r.Name).Should().NotContain("FleetBRoute");
    }

    /// <summary>A logged-out visitor with only the fleet slug (no JWT) gets the fleet's valid-now
    /// routes — the AC#1 3-tap order path starts here, before login.</summary>
    [Fact]
    public async Task CommonRoutes_Anonymous_ReturnsValidNowRoutes()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var fleet = BuildFleet(suffix);
        await SeedAsync(fleet, BuildRoute(fleet.Id, "AirportRun", 500, 127));

        var body = await GetAsync(AnonymousClient(fleet));
        body.Routes.Select(r => r.Name).Should().Contain("AirportRun");
    }

    /// <summary>For a PointToPoint route the DTO exposes pickup/dropoff addresses and coordinates so the
    /// customer can create an order in 3 taps without geocoding. Coords come from the Route entity.</summary>
    [Fact]
    public async Task CommonRoutes_PointToPoint_ExposesCoordsAndAddresses()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var fleet = BuildFleet(suffix);
        await SeedAsync(fleet, BuildRoute(fleet.Id, "Namesti -> Letiste", 450, 127));

        var body = await GetAsync(AnonymousClient(fleet));
        var route = body.Routes.Single(r => r.Name == "Namesti -> Letiste");

        route.Type.Should().Be("PointToPoint");
        route.PickupAddress.Should().NotBeNullOrWhiteSpace();
        route.PickupLat.Should().Be(50.08);
        route.PickupLng.Should().Be(14.43);
        route.DropoffLat.Should().Be(50.10);
        route.DropoffLng.Should().Be(14.26);
    }

    /// <summary>The fields the DTO exposes for a PointToPoint route satisfy the customer
    /// CreateOrder validator — proving the AC#1 3-tap order submit no longer 400s on pickup coords.</summary>
    [Fact]
    public async Task CommonRoutes_PointToPointFields_SatisfyCreateOrderValidator()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var fleet = BuildFleet(suffix);
        await SeedAsync(fleet, BuildRoute(fleet.Id, "Namesti -> Letiste", 450, 127));

        var body = await GetAsync(AnonymousClient(fleet));
        var route = body.Routes.Single(r => r.Name == "Namesti -> Letiste");

        var request = new Taxi.Api.Features.Orders.CreateOrder.CreateOrderRequest
        {
            PickupAddress = route.PickupAddress!,
            PickupLat = route.PickupLat!.Value,
            PickupLng = route.PickupLng!.Value,
            DropoffAddress = route.DropoffAddress,
            DropoffLat = route.DropoffLat,
            DropoffLng = route.DropoffLng,
            Passengers = 1,
            PriceType = Taxi.Api.Infrastructure.Entities.PriceType.Fixed,
            FixedPriceCzk = route.PriceCzk,
            RouteId = route.Id
        };

        var result = new Taxi.Api.Features.Orders.CreateOrder.CreateOrderValidator().TestValidate(request);
        result.IsValid.Should().BeTrue(because: "route DTO coords + address must satisfy the create-order validator");
    }

    /// <summary>No fleet resolved (no X-Fleet-Slug, no subdomain) → 404, same contract as public/fleet.
    /// Guards against a regression that would drop the null-tenant guard and return empty 200.</summary>
    [Fact]
    public async Task CommonRoutes_NoFleetResolved_Returns404()
    {
        var ct = TestContext.Current.CancellationToken;
        var client = fixture.Factory.CreateClient(); // no X-Fleet-Slug, no auth

        var resp = await client.GetAsync("api/v1/routes/common?validNow=true", ct);
        resp.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    /// <summary>A PointToPoint route with NO dropoff coords must NOT advertise a dropoff address — otherwise
    /// the create-order validator (DropoffLat/Lng NotNull When DropoffAddress is not null) would 400 and
    /// reintroduce the AC#1 blocker. Pickup coords still flow so the 3-tap order still works.</summary>
    [Fact]
    public async Task CommonRoutes_PointToPointNoDropoffCoords_OmitsDropoffAddress_StillValid()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var fleet = BuildFleet(suffix);
        await SeedAsync(fleet, BuildRoute(fleet.Id, "Pickup only", 250, 127, toLat: null, toLng: null));

        var body = await GetAsync(AnonymousClient(fleet));
        var route = body.Routes.Single(r => r.Name == "Pickup only");

        route.DropoffAddress.Should().BeNull("null dropoff coords must not pair with a dropoff address");
        route.DropoffLat.Should().BeNull();
        route.DropoffLng.Should().BeNull();

        var request = new Taxi.Api.Features.Orders.CreateOrder.CreateOrderRequest
        {
            PickupAddress = route.PickupAddress!,
            PickupLat = route.PickupLat!.Value,
            PickupLng = route.PickupLng!.Value,
            DropoffAddress = route.DropoffAddress,
            DropoffLat = route.DropoffLat,
            DropoffLng = route.DropoffLng,
            Passengers = 1,
            PriceType = Taxi.Api.Infrastructure.Entities.PriceType.Fixed,
            FixedPriceCzk = route.PriceCzk,
            RouteId = route.Id
        };

        var result = new Taxi.Api.Features.Orders.CreateOrder.CreateOrderValidator().TestValidate(request);
        result.IsValid.Should().BeTrue(because: "pickup-only route fields must still satisfy the create-order validator");
    }
}

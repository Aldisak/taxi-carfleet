using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Features.Routes.CreateRoute;
using Taxi.Api.Features.Routes.ListRoutes;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Tests.Infrastructure;
using RouteEntity = Taxi.Api.Infrastructure.Entities.Route;

namespace Taxi.Api.Tests.Routes;

/// <summary>Integration tests for the Routes admin CRUD (A5) — priority-desc listing, per-type create
/// validation, soft delete, PATCH enable/priority, tenant isolation, FleetAdmin authorization.</summary>
[Collection(TestCollections.Database)]
public sealed class RoutesCrudTests(PostgresFixture fixture)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private static Fleet BuildFleet(string slugSuffix) => new()
    {
        Id = Guid.CreateVersion7(),
        Slug = $"radmin-{slugSuffix}",
        Name = $"Routes Admin Fleet {slugSuffix}",
        Phone = "+420605000001",
        Currency = "CZK",
        TimeZone = "Europe/Prague",
        IsActive = true,
        CreatedAt = DateTimeOffset.UtcNow
    };

    private async Task<Fleet> SeedFleetAsync(string suffix)
    {
        var ct = TestContext.Current.CancellationToken;
        var fleet = BuildFleet(suffix);
        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.Fleets.Add(fleet);
        await db.SaveChangesAsync(ct);
        return fleet;
    }

    private HttpClient AdminClient(Fleet fleet) =>
        fixture.Factory.CreateClient().AsFleetAdmin(fleet.Id, fleetSlug: fleet.Slug);

    private static object PointToPointBody(string name, int price, int priority) => new
    {
        name,
        type = "PointToPoint",
        priceCzk = price,
        fromLat = 50.0281,
        fromLng = 15.2006,
        toLat = 49.9481,
        toLng = 15.2681,
        fromRadiusMeters = 300.0,
        toRadiusMeters = 300.0,
        validDays = 127,
        priority,
        isEnabled = true
    };

    private async Task<Guid> CreateZoneAsync(Fleet fleet, string name)
    {
        var ct = TestContext.Current.CancellationToken;
        var zoneId = Guid.CreateVersion7();
        using var scope = fixture.Factory.Services.CreateScope();
        var tenant = scope.ServiceProvider.GetRequiredService<CurrentTenant>();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        tenant.FleetId = fleet.Id;
        db.Zones.Add(new Zone
        {
            Id = zoneId,
            FleetId = fleet.Id,
            Name = name,
            Shape = ZoneShape.Circle,
            CenterLat = 49.95,
            CenterLng = 15.27,
            RadiusMeters = 4000,
            IsEnabled = true
        });
        await db.SaveChangesAsync(ct);
        return zoneId;
    }

    /// <summary>List returns routes ordered by priority descending.</summary>
    [Fact]
    public async Task Routes_List_OrderedByPriorityDesc()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleet = await SeedFleetAsync(Guid.NewGuid().ToString("N")[..8]);
        var client = AdminClient(fleet);

        await client.PostAsJsonAsync("api/v1/routes", PointToPointBody("Low", 100, 1), ct);
        await client.PostAsJsonAsync("api/v1/routes", PointToPointBody("High", 200, 50), ct);
        await client.PostAsJsonAsync("api/v1/routes", PointToPointBody("Mid", 150, 20), ct);

        var list = await (await client.GetAsync("api/v1/routes", ct))
            .Content.ReadFromJsonAsync<ListRoutesResponse>(JsonOptions, ct);
        list!.Routes.Select(r => r.Name).Should().ContainInOrder("High", "Mid", "Low");
    }

    /// <summary>A PointToPoint route is created and persisted with radii.</summary>
    [Fact]
    public async Task Routes_Create_PointToPoint_Persists()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleet = await SeedFleetAsync(Guid.NewGuid().ToString("N")[..8]);
        var client = AdminClient(fleet);

        var resp = await client.PostAsJsonAsync("api/v1/routes", PointToPointBody("P2P", 100, 5), ct);
        resp.StatusCode.Should().Be(HttpStatusCode.Created);
        var created = await resp.Content.ReadFromJsonAsync<CreateRouteResponse>(JsonOptions, ct);

        var list = await (await client.GetAsync("api/v1/routes", ct))
            .Content.ReadFromJsonAsync<ListRoutesResponse>(JsonOptions, ct);
        var route = list!.Routes.Single(r => r.Id == created!.Id);
        route.Type.Should().Be("PointToPoint");
        route.FromRadiusMeters.Should().Be(300);
    }

    /// <summary>A Zone route without a from-zone is rejected with 400.</summary>
    [Fact]
    public async Task Routes_Create_Zone_RequiresFromZone_Returns400WhenMissing()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleet = await SeedFleetAsync(Guid.NewGuid().ToString("N")[..8]);
        var client = AdminClient(fleet);

        var resp = await client.PostAsJsonAsync("api/v1/routes", new
        {
            name = "ZoneNoFrom",
            type = "Zone",
            priceCzk = 110,
            validDays = 127,
            priority = 5,
            isEnabled = true
        }, ct);
        resp.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    /// <summary>A ZoneToZone route with both zones is created and persisted.</summary>
    [Fact]
    public async Task Routes_Create_ZoneToZone_Persists()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleet = await SeedFleetAsync(Guid.NewGuid().ToString("N")[..8]);
        var client = AdminClient(fleet);
        var fromZone = await CreateZoneAsync(fleet, "From");
        var toZone = await CreateZoneAsync(fleet, "To");

        var resp = await client.PostAsJsonAsync("api/v1/routes", new
        {
            name = "Z2Z",
            type = "ZoneToZone",
            priceCzk = 300,
            fromZoneId = fromZone,
            toZoneId = toZone,
            isBidirectional = true,
            validDays = 127,
            priority = 15,
            isEnabled = true
        }, ct);
        resp.StatusCode.Should().Be(HttpStatusCode.Created);
        var created = await resp.Content.ReadFromJsonAsync<CreateRouteResponse>(JsonOptions, ct);

        var list = await (await client.GetAsync("api/v1/routes", ct))
            .Content.ReadFromJsonAsync<ListRoutesResponse>(JsonOptions, ct);
        var route = list!.Routes.Single(r => r.Id == created!.Id);
        route.Type.Should().Be("ZoneToZone");
        route.FromZoneId.Should().Be(fromZone);
        route.ToZoneId.Should().Be(toZone);
        route.IsBidirectional.Should().BeTrue();
    }

    /// <summary>Delete sets DeletedAt (soft delete) and the route vanishes from the list.</summary>
    [Fact]
    public async Task Routes_Delete_SoftDeletesSetsDeletedAt()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleet = await SeedFleetAsync(Guid.NewGuid().ToString("N")[..8]);
        var client = AdminClient(fleet);
        var created = await (await client.PostAsJsonAsync("api/v1/routes", PointToPointBody("ToDelete", 100, 5), ct))
            .Content.ReadFromJsonAsync<CreateRouteResponse>(JsonOptions, ct);

        var delResp = await client.DeleteAsync($"api/v1/routes/{created!.Id}", ct);
        delResp.StatusCode.Should().Be(HttpStatusCode.NoContent);

        // Not in list (filtered out).
        var list = await (await client.GetAsync("api/v1/routes", ct))
            .Content.ReadFromJsonAsync<ListRoutesResponse>(JsonOptions, ct);
        list!.Routes.Should().NotContain(r => r.Id == created.Id);

        // But the row still exists with DeletedAt set.
        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var row = await db.Routes.IgnoreQueryFilters().AsNoTracking().FirstAsync(r => r.Id == created.Id, ct);
        row.DeletedAt.Should().NotBeNull("soft delete sets DeletedAt, never hard-deletes");
    }

    /// <summary>PATCH enable toggles IsEnabled.</summary>
    [Fact]
    public async Task Routes_Enable_Toggles()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleet = await SeedFleetAsync(Guid.NewGuid().ToString("N")[..8]);
        var client = AdminClient(fleet);
        var created = await (await client.PostAsJsonAsync("api/v1/routes", PointToPointBody("Toggle", 100, 5), ct))
            .Content.ReadFromJsonAsync<CreateRouteResponse>(JsonOptions, ct);

        var patchResp = await client.PatchAsJsonAsync($"api/v1/routes/{created!.Id}/enable", new { isEnabled = false }, ct);
        patchResp.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var list = await (await client.GetAsync("api/v1/routes", ct))
            .Content.ReadFromJsonAsync<ListRoutesResponse>(JsonOptions, ct);
        list!.Routes.Single(r => r.Id == created.Id).IsEnabled.Should().BeFalse();
    }

    /// <summary>PATCH priority sets the priority.</summary>
    [Fact]
    public async Task Routes_Priority_Sets()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleet = await SeedFleetAsync(Guid.NewGuid().ToString("N")[..8]);
        var client = AdminClient(fleet);
        var created = await (await client.PostAsJsonAsync("api/v1/routes", PointToPointBody("Prio", 100, 5), ct))
            .Content.ReadFromJsonAsync<CreateRouteResponse>(JsonOptions, ct);

        var patchResp = await client.PatchAsJsonAsync($"api/v1/routes/{created!.Id}/priority", new { priority = 99 }, ct);
        patchResp.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var list = await (await client.GetAsync("api/v1/routes", ct))
            .Content.ReadFromJsonAsync<ListRoutesResponse>(JsonOptions, ct);
        list!.Routes.Single(r => r.Id == created.Id).Priority.Should().Be(99);
    }

    /// <summary>A fleet-A admin cannot delete a fleet-B route — no-leak 404 (tenant isolation).</summary>
    [Fact]
    public async Task Routes_CrossTenant_Returns404()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleetA = await SeedFleetAsync(Guid.NewGuid().ToString("N")[..8]);
        var fleetB = await SeedFleetAsync(Guid.NewGuid().ToString("N")[..8]);
        var createdB = await (await AdminClient(fleetB).PostAsJsonAsync("api/v1/routes", PointToPointBody("FleetBRoute", 100, 5), ct))
            .Content.ReadFromJsonAsync<CreateRouteResponse>(JsonOptions, ct);

        var delResp = await AdminClient(fleetA).DeleteAsync($"api/v1/routes/{createdB!.Id}", ct);
        delResp.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    /// <summary>A non-FleetAdmin (dispatcher) is forbidden from listing admin routes.</summary>
    [Fact]
    public async Task Routes_NonFleetAdmin_Returns403()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleet = await SeedFleetAsync(Guid.NewGuid().ToString("N")[..8]);

        var client = fixture.Factory.CreateClient().AsDispatcher(fleet.Id, fleetSlug: fleet.Slug);
        var resp = await client.GetAsync("api/v1/routes", ct);
        resp.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }
}

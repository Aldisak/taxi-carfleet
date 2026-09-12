using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Features.Zones.CreateZone;
using Taxi.Api.Features.Zones.ListZones;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Zones;

/// <summary>Integration tests for the Zones CRUD (A4) — Circle + Polygon create (jsonb), >200-point
/// rejection, list, update (shape switch), delete, tenant isolation, and FleetAdmin authorization.</summary>
[Collection(TestCollections.Database)]
public sealed class ZonesCrudTests(PostgresFixture fixture)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private static Fleet BuildFleet(string slugSuffix) => new()
    {
        Id = Guid.CreateVersion7(),
        Slug = $"zones-{slugSuffix}",
        Name = $"Zones Fleet {slugSuffix}",
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

    /// <summary>A Circle zone is created and persisted.</summary>
    [Fact]
    public async Task Zones_Create_Circle_Persists()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleet = await SeedFleetAsync(Guid.NewGuid().ToString("N")[..8]);

        var resp = await AdminClient(fleet).PostAsJsonAsync("api/v1/zones", new
        {
            name = "Kutná Hora",
            shape = "Circle",
            centerLat = 49.9481,
            centerLng = 15.2681,
            radiusMeters = 4000.0,
            isEnabled = true
        }, ct);
        resp.StatusCode.Should().Be(HttpStatusCode.Created);
        var created = await resp.Content.ReadFromJsonAsync<CreateZoneResponse>(JsonOptions, ct);
        created!.Id.Should().NotBeEmpty();
    }

    /// <summary>A Polygon zone is created and the jsonb polygon round-trips.</summary>
    [Fact]
    public async Task Zones_Create_Polygon_PersistsJsonb()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleet = await SeedFleetAsync(Guid.NewGuid().ToString("N")[..8]);

        var polygon = new[]
        {
            new[] { 49.94, 15.26 },
            new[] { 49.94, 15.28 },
            new[] { 49.96, 15.28 },
            new[] { 49.96, 15.26 }
        };
        var resp = await AdminClient(fleet).PostAsJsonAsync("api/v1/zones", new
        {
            name = "KH polygon",
            shape = "Polygon",
            polygon,
            isEnabled = true
        }, ct);
        resp.StatusCode.Should().Be(HttpStatusCode.Created);

        var list = await (await AdminClient(fleet).GetAsync("api/v1/zones", ct))
            .Content.ReadFromJsonAsync<ListZonesResponse>(JsonOptions, ct);
        var zone = list!.Zones.Single(z => z.Name == "KH polygon");
        zone.Shape.Should().Be("Polygon");
        zone.Polygon.Should().NotBeNull();
        zone.Polygon!.Length.Should().Be(4);
        zone.Polygon[0][0].Should().BeApproximately(49.94, 1e-6);
        zone.RadiusMeters.Should().BeNull();
    }

    /// <summary>A polygon with more than 200 points is rejected with 400.</summary>
    [Fact]
    public async Task Zones_Create_PolygonOver200_Returns400()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleet = await SeedFleetAsync(Guid.NewGuid().ToString("N")[..8]);

        var polygon = Enumerable.Range(0, 201)
            .Select(i => new[] { 49.94 + i * 0.0001, 15.26 })
            .ToArray();
        var resp = await AdminClient(fleet).PostAsJsonAsync("api/v1/zones", new
        {
            name = "Too big",
            shape = "Polygon",
            polygon,
            isEnabled = true
        }, ct);
        resp.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    /// <summary>List returns both circle and polygon shapes.</summary>
    [Fact]
    public async Task Zones_List_ReturnsShapes()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleet = await SeedFleetAsync(Guid.NewGuid().ToString("N")[..8]);
        var client = AdminClient(fleet);

        await client.PostAsJsonAsync("api/v1/zones", new
        {
            name = "CircleZone",
            shape = "Circle",
            centerLat = 49.95,
            centerLng = 15.27,
            radiusMeters = 2000.0,
            isEnabled = true
        }, ct);

        var list = await (await client.GetAsync("api/v1/zones", ct))
            .Content.ReadFromJsonAsync<ListZonesResponse>(JsonOptions, ct);
        list!.Zones.Should().Contain(z => z.Name == "CircleZone" && z.Shape == "Circle");
    }

    /// <summary>Update can switch a circle zone into a polygon zone.</summary>
    [Fact]
    public async Task Zones_Update_ChangesShape()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleet = await SeedFleetAsync(Guid.NewGuid().ToString("N")[..8]);
        var client = AdminClient(fleet);

        var createResp = await client.PostAsJsonAsync("api/v1/zones", new
        {
            name = "Morph",
            shape = "Circle",
            centerLat = 49.95,
            centerLng = 15.27,
            radiusMeters = 1000.0,
            isEnabled = true
        }, ct);
        var created = await createResp.Content.ReadFromJsonAsync<CreateZoneResponse>(JsonOptions, ct);

        var polygon = new[]
        {
            new[] { 49.94, 15.26 },
            new[] { 49.94, 15.28 },
            new[] { 49.96, 15.27 }
        };
        var updateResp = await client.PutAsJsonAsync($"api/v1/zones/{created!.Id}", new
        {
            name = "Morph",
            shape = "Polygon",
            polygon,
            isEnabled = true
        }, ct);
        updateResp.StatusCode.Should().Be(HttpStatusCode.OK);
        var updated = await updateResp.Content.ReadFromJsonAsync<ZoneDto>(JsonOptions, ct);
        updated!.Shape.Should().Be("Polygon");
        updated.RadiusMeters.Should().BeNull();
        updated.Polygon!.Length.Should().Be(3);
    }

    /// <summary>Delete removes the zone.</summary>
    [Fact]
    public async Task Zones_Delete_Removes()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleet = await SeedFleetAsync(Guid.NewGuid().ToString("N")[..8]);
        var client = AdminClient(fleet);

        var createResp = await client.PostAsJsonAsync("api/v1/zones", new
        {
            name = "ToDelete",
            shape = "Circle",
            centerLat = 49.95,
            centerLng = 15.27,
            radiusMeters = 500.0,
            isEnabled = true
        }, ct);
        var created = await createResp.Content.ReadFromJsonAsync<CreateZoneResponse>(JsonOptions, ct);

        var delResp = await client.DeleteAsync($"api/v1/zones/{created!.Id}", ct);
        delResp.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var list = await (await client.GetAsync("api/v1/zones", ct))
            .Content.ReadFromJsonAsync<ListZonesResponse>(JsonOptions, ct);
        list!.Zones.Should().NotContain(z => z.Id == created.Id);
    }

    /// <summary>A fleet-A admin cannot delete a fleet-B zone — no-leak 404 (tenant isolation).</summary>
    [Fact]
    public async Task Zones_CrossTenant_Returns404()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleetA = await SeedFleetAsync(Guid.NewGuid().ToString("N")[..8]);
        var fleetB = await SeedFleetAsync(Guid.NewGuid().ToString("N")[..8]);

        var createResp = await AdminClient(fleetB).PostAsJsonAsync("api/v1/zones", new
        {
            name = "FleetBZone",
            shape = "Circle",
            centerLat = 49.95,
            centerLng = 15.27,
            radiusMeters = 500.0,
            isEnabled = true
        }, ct);
        var createdB = await createResp.Content.ReadFromJsonAsync<CreateZoneResponse>(JsonOptions, ct);

        var delResp = await AdminClient(fleetA).DeleteAsync($"api/v1/zones/{createdB!.Id}", ct);
        delResp.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    /// <summary>A non-FleetAdmin (dispatcher) is forbidden from listing zones.</summary>
    [Fact]
    public async Task Zones_NonFleetAdmin_Returns403()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleet = await SeedFleetAsync(Guid.NewGuid().ToString("N")[..8]);

        var client = fixture.Factory.CreateClient().AsDispatcher(fleet.Id, fleetSlug: fleet.Slug);
        var resp = await client.GetAsync("api/v1/zones", ct);
        resp.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }
}

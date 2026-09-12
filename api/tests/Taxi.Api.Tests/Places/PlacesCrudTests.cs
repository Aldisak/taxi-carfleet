using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Features.Places.CreatePlace;
using Taxi.Api.Features.Places.ListPlaces;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Places;

/// <summary>Integration tests for the Places CRUD (A2) — list ordered by sort order, create, update,
/// delete, tenant isolation (cross-fleet 404), and FleetAdmin authorization.</summary>
[Collection(TestCollections.Database)]
public sealed class PlacesCrudTests(PostgresFixture fixture)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private static Fleet BuildFleet(string slugSuffix) => new()
    {
        Id = Guid.CreateVersion7(),
        Slug = $"places-{slugSuffix}",
        Name = $"Places Fleet {slugSuffix}",
        Phone = "+420605000001",
        Currency = "CZK",
        TimeZone = "Europe/Prague",
        IsActive = true,
        CreatedAt = DateTimeOffset.UtcNow
    };

    private async Task<Fleet> SeedFleetAsync(string suffix, params Place[] places)
    {
        var ct = TestContext.Current.CancellationToken;
        var fleet = BuildFleet(suffix);
        using var scope = fixture.Factory.Services.CreateScope();
        var tenant = scope.ServiceProvider.GetRequiredService<CurrentTenant>();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.Fleets.Add(fleet);
        await db.SaveChangesAsync(ct);
        tenant.FleetId = fleet.Id;
        foreach (var p in places) db.Places.Add(p);
        await db.SaveChangesAsync(ct);
        return fleet;
    }

    private static Place BuildPlace(Guid fleetId, string name, int sortOrder) => new()
    {
        Id = Guid.CreateVersion7(),
        FleetId = fleetId,
        Name = name,
        Lat = 49.95,
        Lng = 15.27,
        Address = $"{name} address",
        SortOrder = sortOrder,
        IsEnabled = true
    };

    private HttpClient AdminClient(Fleet fleet) =>
        fixture.Factory.CreateClient().AsFleetAdmin(fleet.Id, fleetSlug: fleet.Slug);

    /// <summary>List returns places ordered by sort order ascending.</summary>
    [Fact]
    public async Task Places_List_OrderedBySortOrder()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var fleet = await SeedFleetAsync(suffix);
        var fleetId = fleet.Id;

        await SeedPlaces(fleetId,
            BuildPlace(fleetId, "Third", 30),
            BuildPlace(fleetId, "First", 10),
            BuildPlace(fleetId, "Second", 20));

        var resp = await AdminClient(fleet).GetAsync("api/v1/places", ct);
        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<ListPlacesResponse>(JsonOptions, ct);

        body!.Places.Select(p => p.Name).Should().ContainInOrder("First", "Second", "Third");
    }

    /// <summary>Create persists a place and it appears in the list.</summary>
    [Fact]
    public async Task Places_Create_Persists()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var fleet = await SeedFleetAsync(suffix);

        var resp = await AdminClient(fleet).PostAsJsonAsync("api/v1/places", new
        {
            name = "Nádraží",
            lat = 50.0281,
            lng = 15.2006,
            address = "Rorejcova, Kolín",
            sortOrder = 5,
            isEnabled = true
        }, ct);
        resp.StatusCode.Should().Be(HttpStatusCode.Created);
        var created = await resp.Content.ReadFromJsonAsync<CreatePlaceResponse>(JsonOptions, ct);
        created!.Id.Should().NotBeEmpty();
        created.Name.Should().Be("Nádraží");

        var list = await (await AdminClient(fleet).GetAsync("api/v1/places", ct))
            .Content.ReadFromJsonAsync<ListPlacesResponse>(JsonOptions, ct);
        list!.Places.Should().Contain(p => p.Id == created.Id);
    }

    /// <summary>Update changes the fields of an existing place.</summary>
    [Fact]
    public async Task Places_Update_ChangesFields()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var fleet = await SeedFleetAsync(suffix);
        var place = BuildPlace(fleet.Id, "Old", 1);
        await SeedPlaces(fleet.Id, place);

        var resp = await AdminClient(fleet).PutAsJsonAsync($"api/v1/places/{place.Id}", new
        {
            name = "New Name",
            lat = 50.1,
            lng = 15.3,
            address = "New address",
            sortOrder = 7,
            isEnabled = false
        }, ct);
        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var updated = await resp.Content.ReadFromJsonAsync<PlaceDto>(JsonOptions, ct);
        updated!.Name.Should().Be("New Name");
        updated.SortOrder.Should().Be(7);
        updated.IsEnabled.Should().BeFalse();
    }

    /// <summary>Delete removes the place.</summary>
    [Fact]
    public async Task Places_Delete_Removes()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var fleet = await SeedFleetAsync(suffix);
        var place = BuildPlace(fleet.Id, "ToDelete", 1);
        await SeedPlaces(fleet.Id, place);

        var resp = await AdminClient(fleet).DeleteAsync($"api/v1/places/{place.Id}", ct);
        resp.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var list = await (await AdminClient(fleet).GetAsync("api/v1/places", ct))
            .Content.ReadFromJsonAsync<ListPlacesResponse>(JsonOptions, ct);
        list!.Places.Should().NotContain(p => p.Id == place.Id);
    }

    /// <summary>A fleet-A admin cannot update or delete a fleet-B place — no-leak 404 (tenant isolation).</summary>
    [Fact]
    public async Task Places_CrossTenant_Returns404()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffixA = Guid.NewGuid().ToString("N")[..8];
        var suffixB = Guid.NewGuid().ToString("N")[..8];
        var fleetA = await SeedFleetAsync(suffixA);
        var fleetB = await SeedFleetAsync(suffixB);
        var placeB = BuildPlace(fleetB.Id, "FleetBPlace", 1);
        await SeedPlaces(fleetB.Id, placeB);

        var putResp = await AdminClient(fleetA).PutAsJsonAsync($"api/v1/places/{placeB.Id}", new
        {
            name = "Hijack",
            lat = 0.0,
            lng = 0.0,
            address = "x",
            sortOrder = 0,
            isEnabled = true
        }, ct);
        putResp.StatusCode.Should().Be(HttpStatusCode.NotFound);

        var delResp = await AdminClient(fleetA).DeleteAsync($"api/v1/places/{placeB.Id}", ct);
        delResp.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    /// <summary>A non-FleetAdmin (dispatcher) is forbidden from listing places.</summary>
    [Fact]
    public async Task Places_NonFleetAdmin_Returns403()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var fleet = await SeedFleetAsync(suffix);

        var client = fixture.Factory.CreateClient().AsDispatcher(fleet.Id, fleetSlug: fleet.Slug);
        var resp = await client.GetAsync("api/v1/places", ct);
        resp.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    private async Task SeedPlaces(Guid fleetId, params Place[] places)
    {
        var ct = TestContext.Current.CancellationToken;
        using var scope = fixture.Factory.Services.CreateScope();
        var tenant = scope.ServiceProvider.GetRequiredService<CurrentTenant>();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        tenant.FleetId = fleetId;
        foreach (var p in places) db.Places.Add(p);
        await db.SaveChangesAsync(ct);
    }
}

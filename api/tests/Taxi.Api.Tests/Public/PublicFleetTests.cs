using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Features.Public.GetFleet;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Public;

/// <summary>Integration tests for GET public/fleet (A-public-fleet) — anonymous branding endpoint,
/// fleet resolved from X-Fleet-Slug, tenant isolation.</summary>
[Collection(TestCollections.Database)]
public sealed class PublicFleetTests(PostgresFixture fixture)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private static Fleet BuildFleet(string slugSuffix, string name, string phone, string? color) => new()
    {
        Id = Guid.CreateVersion7(),
        Slug = $"pub-{slugSuffix}",
        Name = name,
        Phone = phone,
        Currency = "CZK",
        TimeZone = "Europe/Prague",
        PrimaryColorHex = color,
        IsActive = true,
        CreatedAt = DateTimeOffset.UtcNow
    };

    /// <summary>Known slug → 200 with the fleet's branding fields.</summary>
    [Fact]
    public async Task PublicFleet_KnownSlug_ReturnsBranding()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];

        using var seedScope = fixture.Factory.Services.CreateScope();
        var seedDb = seedScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var fleet = BuildFleet(suffix, "Taxi Praha", "+420605111222", "#1A2B3C");
        seedDb.Fleets.Add(fleet);
        await seedDb.SaveChangesAsync(ct);

        var client = fixture.Factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Fleet-Slug", fleet.Slug);

        var response = await client.GetAsync("api/v1/public/fleet", ct);
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadFromJsonAsync<GetFleetResponse>(JsonOptions, ct);
        body.Should().NotBeNull();
        body!.Name.Should().Be("Taxi Praha");
        body.Phone.Should().Be("+420605111222");
        body.PrimaryColorHex.Should().Be("#1A2B3C");
        body.Currency.Should().Be("CZK");
        body.TimeZone.Should().Be("Europe/Prague");
    }

    /// <summary>Unknown slug → 404 (no fleet resolves, no leak).</summary>
    [Fact]
    public async Task PublicFleet_UnknownSlug_Returns404()
    {
        var ct = TestContext.Current.CancellationToken;

        var client = fixture.Factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Fleet-Slug", $"no-such-{Guid.NewGuid():N}");

        var response = await client.GetAsync("api/v1/public/fleet", ct);
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    /// <summary>No slug header at all (localhost, no subdomain) → 404.</summary>
    [Fact]
    public async Task PublicFleet_NoSlug_Returns404()
    {
        var ct = TestContext.Current.CancellationToken;

        var client = fixture.Factory.CreateClient();

        var response = await client.GetAsync("api/v1/public/fleet", ct);
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    /// <summary>Fleet A's slug never returns fleet B's data (tenant isolation).</summary>
    [Fact]
    public async Task PublicFleet_FleetASlug_NeverReturnsFleetBData()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffixA = Guid.NewGuid().ToString("N")[..8];
        var suffixB = Guid.NewGuid().ToString("N")[..8];

        using var seedScope = fixture.Factory.Services.CreateScope();
        var seedDb = seedScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var fleetA = BuildFleet(suffixA, "Fleet Alpha", "+420605000111", "#AAAAAA");
        var fleetB = BuildFleet(suffixB, "Fleet Bravo", "+420605000222", "#BBBBBB");
        seedDb.Fleets.Add(fleetA);
        seedDb.Fleets.Add(fleetB);
        await seedDb.SaveChangesAsync(ct);

        var client = fixture.Factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Fleet-Slug", fleetA.Slug);

        var response = await client.GetAsync("api/v1/public/fleet", ct);
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadFromJsonAsync<GetFleetResponse>(JsonOptions, ct);
        body.Should().NotBeNull();
        body!.Name.Should().Be("Fleet Alpha", "slug A must resolve only to fleet A's branding");
        body.Phone.Should().Be("+420605000111");
        body.Name.Should().NotBe("Fleet Bravo");
    }
}

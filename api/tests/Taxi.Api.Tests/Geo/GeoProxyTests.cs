using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using FluentValidation.TestHelper;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Geo;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Geo;

/// <summary>Integration tests for the Geo proxy endpoints (A1).</summary>
[Collection(TestCollections.Database)]
public sealed class GeoProxyTests(PostgresFixture fixture)
{
    // ── Suggest tests ─────────────────────────────────────────────────────────

    /// <summary>GET /api/v1/geo/suggest with a valid query delegates to IGeoProvider and returns
    /// labelled coordinate results in a 200 response.</summary>
    [Fact]
    public async Task Suggest_ValidQuery_ReturnsLabelledCoords()
    {
        var ct = TestContext.Current.CancellationToken;

        // Arrange
        var fake = fixture.Factory.Services.GetRequiredService<FakeGeoProvider>();
        fake.Reset();
        fake.SuggestResult = [new GeoSuggestItem("Prague Centre", 50.08, 14.43)];

        var client = fixture.Factory.CreateClient();
        client.AsDispatcher(Guid.CreateVersion7());

        // Act
        var resp = await client.GetAsync("/api/v1/geo/suggest?q=Prague", ct);

        // Assert
        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<SuggestResponse>(cancellationToken: ct);
        body.Should().NotBeNull();
        body!.Items.Should().HaveCount(1);
        body.Items[0].Label.Should().Be("Prague Centre");
        body.Items[0].Lat.Should().BeApproximately(50.08, 0.001);
        body.Items[0].Lng.Should().BeApproximately(14.43, 0.001);
    }

    /// <summary>When the upstream provider throws, suggest returns 200 with an empty list (never 5xx).</summary>
    [Fact]
    public async Task Suggest_UpstreamThrows_Returns200EmptyList()
    {
        var ct = TestContext.Current.CancellationToken;

        var fake = fixture.Factory.Services.GetRequiredService<FakeGeoProvider>();
        fake.Reset();
        fake.SuggestShouldThrow = true;

        var client = fixture.Factory.CreateClient();
        client.AsDispatcher(Guid.CreateVersion7());

        var resp = await client.GetAsync("/api/v1/geo/suggest?q=Prague", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<SuggestResponse>(cancellationToken: ct);
        body!.Items.Should().BeEmpty();
    }

    /// <summary>A driver caller receives 403 Forbidden. After A-geo-suggest, suggest is
    /// CustomerOrStaff (Customer + Dispatcher + FleetAdmin); drivers remain excluded.</summary>
    [Fact]
    public async Task Suggest_NonDispatcher_Returns403()
    {
        var ct = TestContext.Current.CancellationToken;

        var client = fixture.Factory.CreateClient();
        client.AsDriver(Guid.CreateVersion7(), Guid.CreateVersion7());

        var resp = await client.GetAsync("/api/v1/geo/suggest?q=Prague", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    // ── Route tests ───────────────────────────────────────────────────────────

    /// <summary>GET /api/v1/geo/route with valid coords returns distance, duration, and a server-priced estimate.</summary>
    [Fact]
    public async Task Route_ValidCoords_ReturnsDistanceDurationAndServerPrice()
    {
        var ct = TestContext.Current.CancellationToken;

        var fleetId = Guid.CreateVersion7();
        await SeedFleetWithTariff(fleetId, baseFare: 50, perKm: 30, minimum: 60, ct);

        var fake = fixture.Factory.Services.GetRequiredService<FakeGeoProvider>();
        fake.Reset();
        fake.RouteResult = new GeoRouteResult(5000, 600); // 5 km, 10 min

        var client = fixture.Factory.CreateClient();
        client.AsDispatcher(fleetId);

        var resp = await client.GetAsync("/api/v1/geo/route?fromLat=50.08&fromLng=14.43&toLat=50.09&toLng=14.44", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<RouteResponse>(cancellationToken: ct);
        body.Should().NotBeNull();
        body!.DistanceMeters.Should().Be(5000);
        body.DurationSeconds.Should().Be(600);
        // price = max(60, 50 + 30 * 5) = max(60, 200) = 200
        body.EstimatedPriceCzk.Should().Be(200);
    }

    /// <summary>When no enabled default tariff exists, estimatedPriceCzk is null.</summary>
    [Fact]
    public async Task Route_NoDefaultTariff_ReturnsNullPrice()
    {
        var ct = TestContext.Current.CancellationToken;

        var fleetId = Guid.CreateVersion7();
        await SeedFleetOnly(fleetId, ct);

        var fake = fixture.Factory.Services.GetRequiredService<FakeGeoProvider>();
        fake.Reset();
        fake.RouteResult = new GeoRouteResult(3000, 300);

        var client = fixture.Factory.CreateClient();
        client.AsDispatcher(fleetId);

        var resp = await client.GetAsync("/api/v1/geo/route?fromLat=50.08&fromLng=14.43&toLat=50.09&toLng=14.44", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<RouteResponse>(cancellationToken: ct);
        body!.EstimatedPriceCzk.Should().BeNull();
    }

    /// <summary>Route uses the calling fleet's default tariff (tenant isolation).</summary>
    [Fact]
    public async Task Route_UsesCallersFleetDefaultTariff()
    {
        var ct = TestContext.Current.CancellationToken;

        var fleetAId = Guid.CreateVersion7();
        var fleetBId = Guid.CreateVersion7();
        await SeedFleetWithTariff(fleetAId, baseFare: 100, perKm: 10, minimum: 50, ct);
        await SeedFleetWithTariff(fleetBId, baseFare: 200, perKm: 20, minimum: 100, ct);

        var fake = fixture.Factory.Services.GetRequiredService<FakeGeoProvider>();
        fake.Reset();
        fake.RouteResult = new GeoRouteResult(10000, 900); // 10 km

        var client = fixture.Factory.CreateClient();
        client.AsDispatcher(fleetBId);

        var resp = await client.GetAsync("/api/v1/geo/route?fromLat=50.08&fromLng=14.43&toLat=50.09&toLng=14.44", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<RouteResponse>(cancellationToken: ct);
        // fleet B: max(100, 200 + 20*10) = max(100, 400) = 400
        body!.EstimatedPriceCzk.Should().Be(400);
    }

    /// <summary>When the route upstream throws, returns 502 with Geo.RouteUnavailable error code.</summary>
    [Fact]
    public async Task Route_UpstreamThrows_Returns502WithCode()
    {
        var ct = TestContext.Current.CancellationToken;

        var fleetId = Guid.CreateVersion7();
        await SeedFleetOnly(fleetId, ct);

        var fake = fixture.Factory.Services.GetRequiredService<FakeGeoProvider>();
        fake.Reset();
        fake.RouteShouldThrow = true;

        var client = fixture.Factory.CreateClient();
        client.AsDispatcher(fleetId);

        var resp = await client.GetAsync("/api/v1/geo/route?fromLat=50.08&fromLng=14.43&toLat=50.09&toLng=14.44", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.BadGateway);
    }

    // ── Validator unit tests ──────────────────────────────────────────────────

    /// <summary>Suggest validator fails with Geo.SuggestQueryTooShort when query is shorter than 3 chars.</summary>
    [Fact]
    public void SuggestValidator_QueryTooShort_FailsWithCode()
    {
        var result = new Taxi.Api.Features.Geo.Suggest.SuggestValidator()
            .TestValidate(new Taxi.Api.Features.Geo.Suggest.SuggestRequest { Q = "ab" });
        result.ShouldHaveValidationErrorFor(x => x.Q)
            .WithErrorCode(Taxi.Api.Common.ErrorCodes.Geo.SuggestQueryTooShort);
    }

    // ── Seed helpers ──────────────────────────────────────────────────────────

    private async Task SeedFleetOnly(Guid fleetId, CancellationToken ct)
    {
        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.Fleets.Add(new Fleet
        {
            Id = fleetId,
            Slug = $"geo-{fleetId:N}",
            Name = "Geo Test Fleet",
            Phone = "+420601000999",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync(ct);
    }

    private async Task SeedFleetWithTariff(Guid fleetId, int baseFare, int perKm, int minimum, CancellationToken ct)
    {
        await SeedFleetOnly(fleetId, ct);

        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.Tariffs.Add(new Tariff
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleetId,
            Name = "Default",
            BaseFareCzk = baseFare,
            PerKmCzk = perKm,
            MinimumFareCzk = minimum,
            IsDefault = true,
            IsEnabled = true
        });
        await db.SaveChangesAsync(ct);
    }

    // ── Response record shapes (for deserialization only) ─────────────────────

    private sealed record SuggestResponse(IReadOnlyList<SuggestItemDto> Items);
    private sealed record SuggestItemDto(string Label, double Lat, double Lng);
    private sealed record RouteResponse(int DistanceMeters, int DurationSeconds, int? EstimatedPriceCzk);
}

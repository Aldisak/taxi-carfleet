using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;
using Taxi.Api.Common.Orders;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Common.Tracking;
using Taxi.Api.Features.Orders.CreateOrder;
using Taxi.Api.Features.Public.TrackByCode;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Public;

/// <summary>Integration and unit tests for the public SMS tracking link (A-track):
/// TrackingTokenService round-trip + GET public/track/{code}?k= behavior and tenant isolation.</summary>
[Collection(TestCollections.Database)]
public sealed class PublicTrackTests(PostgresFixture fixture)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        Converters = { new System.Text.Json.Serialization.JsonStringEnumConverter() }
    };

    private static Fleet BuildFleet(string slugSuffix) => new()
    {
        Id = Guid.CreateVersion7(),
        Slug = $"trkpub-{slugSuffix}",
        Name = $"Track Fleet {slugSuffix}",
        Phone = "+420605000001",
        Currency = "CZK",
        TimeZone = "Europe/Prague",
        IsActive = true,
        CreatedAt = DateTimeOffset.UtcNow
    };

    private static Order BuildOrder(Guid fleetId, string code, OrderStatus status = OrderStatus.New,
        DateTimeOffset? completedAt = null) => new()
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleetId,
            PublicCode = code,
            Status = status,
            Source = OrderSource.App,
            CustomerPhone = "+420606000001",
            PickupAddress = "Namesti Miru",
            PickupLat = 50.0755,
            PickupLng = 14.4378,
            PriceType = PriceType.Fixed,
            FixedPriceCzk = 250,
            CompletedAt = completedAt,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow,
            Version = 1
        };

    private static async Task SeedAsync(PostgresFixture fixture, Fleet fleet, params Order[] orders)
    {
        var ct = TestContext.Current.CancellationToken;
        using var scope = fixture.Factory.Services.CreateScope();
        var tenant = scope.ServiceProvider.GetRequiredService<CurrentTenant>();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.Fleets.Add(fleet);
        await db.SaveChangesAsync(ct);
        tenant.FleetId = fleet.Id;
        foreach (var o in orders) db.Orders.Add(o);
        await db.SaveChangesAsync(ct);
    }

    private static string MintToken(PostgresFixture fixture, Guid orderId, DateTimeOffset expiresAt)
    {
        using var scope = fixture.Factory.Services.CreateScope();
        var svc = scope.ServiceProvider.GetRequiredService<TrackingTokenService>();
        return svc.Mint(orderId, expiresAt);
    }

    private static DateTimeOffset Now => new(2026, 9, 10, 12, 0, 0, TimeSpan.Zero);

    // ── Unit: round-trip mint → validate ─────────────────────────────────────

    /// <summary>A freshly minted token validates against the same order before expiry.</summary>
    [Fact]
    public void TrackingTokenService_RoundTrips_MintThenValidate()
    {
        var time = new FakeTimeProvider(Now);
        var options = Options.Create(new TrackingOptions { HmacKey = "unit-test-hmac-key-min-32-chars-000000" });
        var svc = new TrackingTokenService(options, time);

        var orderId = Guid.CreateVersion7();
        var token = svc.Mint(orderId, Now.AddHours(24));

        svc.Validate(token, orderId, completedAt: null).Should().BeTrue();
        // Wrong order id → fails.
        svc.Validate(token, Guid.CreateVersion7(), completedAt: null).Should().BeFalse();
    }

    // ── Integration: valid token → reduced DTO ───────────────────────────────

    /// <summary>A valid token returns the reduced public DTO (priceType + display price, no phone).</summary>
    [Fact]
    public async Task Track_ValidToken_ReturnsReducedDto()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var fleet = BuildFleet(suffix);
        var order = BuildOrder(fleet.Id, $"T{suffix[..5]}");
        await SeedAsync(fixture, fleet, order);

        var token = MintToken(fixture, order.Id, Now.AddHours(24));

        var client = fixture.Factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Fleet-Slug", fleet.Slug);

        var response = await client.GetAsync($"api/v1/public/track/{order.PublicCode}?k={token}", ct);
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var raw = await response.Content.ReadAsStringAsync(ct);
        raw.Should().Contain("status");
        raw.Should().Contain("priceType");
        raw.Should().NotContain("customerPhone");
        raw.Should().NotContain("606000001");

        var body = await response.Content.ReadFromJsonAsync<TrackByCodeResponse>(JsonOptions, ct);
        body!.PublicCode.Should().Be(order.PublicCode);
        body.DisplayPriceCzk.Should().Be(250);
    }

    // ── Integration: expired token → 410 ─────────────────────────────────────

    /// <summary>A token whose absolute expiry is in the past returns 410.</summary>
    [Fact]
    public async Task Track_ExpiredToken_Returns410()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var fleet = BuildFleet(suffix);
        var order = BuildOrder(fleet.Id, $"E{suffix[..5]}");
        await SeedAsync(fixture, fleet, order);

        // Expiry one hour before the fake clock (2026-09-10 12:00Z).
        var token = MintToken(fixture, order.Id, Now.AddHours(-1));

        var client = fixture.Factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Fleet-Slug", fleet.Slug);

        var response = await client.GetAsync($"api/v1/public/track/{order.PublicCode}?k={token}", ct);
        response.StatusCode.Should().Be(HttpStatusCode.Gone);
    }

    // ── Integration: missing token on a known code → 410 (AC #3) ─────────────

    /// <summary>A missing ?k= on a KNOWN code returns 410 (not 400) — the missing token is
    /// treated as an invalid link, per AC #3. (Unknown code still returns 404 first.)</summary>
    [Fact]
    public async Task Track_MissingToken_Returns410()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var fleet = BuildFleet(suffix);
        var order = BuildOrder(fleet.Id, $"M{suffix[..5]}");
        await SeedAsync(fixture, fleet, order);

        var client = fixture.Factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Fleet-Slug", fleet.Slug);

        var response = await client.GetAsync($"api/v1/public/track/{order.PublicCode}", ct);
        response.StatusCode.Should().Be(HttpStatusCode.Gone);
    }

    // ── Integration: tampered token → 410 ────────────────────────────────────

    /// <summary>A token with a corrupted signature returns 410.</summary>
    [Fact]
    public async Task Track_TamperedToken_Returns410()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var fleet = BuildFleet(suffix);
        var order = BuildOrder(fleet.Id, $"X{suffix[..5]}");
        await SeedAsync(fixture, fleet, order);

        var token = MintToken(fixture, order.Id, Now.AddHours(24));
        // Tamper: flip the last character.
        var tampered = token[..^1] + (token[^1] == 'A' ? 'B' : 'A');

        var client = fixture.Factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Fleet-Slug", fleet.Slug);

        var response = await client.GetAsync($"api/v1/public/track/{order.PublicCode}?k={tampered}", ct);
        response.StatusCode.Should().Be(HttpStatusCode.Gone);
    }

    // ── Integration: completed over 2h → 410 ─────────────────────────────────

    /// <summary>A token for an order completed more than 2h ago returns 410 even if the absolute expiry is future.</summary>
    [Fact]
    public async Task Track_CompletedOver2h_Returns410()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var fleet = BuildFleet(suffix);
        // Completed 3 hours before the fake clock.
        var order = BuildOrder(fleet.Id, $"C{suffix[..5]}", OrderStatus.Completed, Now.AddHours(-3));
        order.FinalPriceCzk = 300;
        await SeedAsync(fixture, fleet, order);

        var token = MintToken(fixture, order.Id, Now.AddHours(24));

        var client = fixture.Factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Fleet-Slug", fleet.Slug);

        var response = await client.GetAsync($"api/v1/public/track/{order.PublicCode}?k={token}", ct);
        response.StatusCode.Should().Be(HttpStatusCode.Gone);
    }

    // ── Integration: completed under 2h → DTO ────────────────────────────────

    /// <summary>A token for an order completed less than 2h ago still returns the DTO.</summary>
    [Fact]
    public async Task Track_CompletedUnder2h_ReturnsDto()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var fleet = BuildFleet(suffix);
        // Completed 30 minutes before the fake clock.
        var order = BuildOrder(fleet.Id, $"U{suffix[..5]}", OrderStatus.Completed, Now.AddMinutes(-30));
        order.FinalPriceCzk = 300;
        await SeedAsync(fixture, fleet, order);

        var token = MintToken(fixture, order.Id, Now.AddHours(24));

        var client = fixture.Factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Fleet-Slug", fleet.Slug);

        var response = await client.GetAsync($"api/v1/public/track/{order.PublicCode}?k={token}", ct);
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadFromJsonAsync<TrackByCodeResponse>(JsonOptions, ct);
        body!.DisplayPriceCzk.Should().Be(300, "completed orders display the final price");
    }

    // ── Integration: cross-tenant slug → 404 ─────────────────────────────────

    /// <summary>Fleet A's code looked up under fleet B's slug returns 404 (tenant isolation).</summary>
    [Fact]
    public async Task Track_FleetASlug_WithFleetBCode_Returns404()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffixA = Guid.NewGuid().ToString("N")[..8];
        var suffixB = Guid.NewGuid().ToString("N")[..8];
        var fleetA = BuildFleet(suffixA);
        var fleetB = BuildFleet(suffixB);
        var orderA = BuildOrder(fleetA.Id, $"A{suffixA[..5]}");

        // Seed both fleets and order A.
        using (var scope = fixture.Factory.Services.CreateScope())
        {
            var tenant = scope.ServiceProvider.GetRequiredService<CurrentTenant>();
            var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
            db.Fleets.Add(fleetA);
            db.Fleets.Add(fleetB);
            await db.SaveChangesAsync(ct);
            tenant.FleetId = fleetA.Id;
            db.Orders.Add(orderA);
            await db.SaveChangesAsync(ct);
        }

        var token = MintToken(fixture, orderA.Id, Now.AddHours(24));

        // Look up order A's code under fleet B's slug — scoped to B, code not found.
        var client = fixture.Factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Fleet-Slug", fleetB.Slug);

        var response = await client.GetAsync($"api/v1/public/track/{orderA.PublicCode}?k={token}", ct);
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    // ── Integration: customer create returns tracking code + token ───────────

    /// <summary>The customer create-order response carries trackingCode, trackingToken, and trackingUrlPath.</summary>
    [Fact]
    public async Task CreateOrder_Customer_ReturnsTrackingCodeAndToken()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var fleet = BuildFleet(suffix);

        var customer = new User
        {
            Id = Guid.CreateVersion7(),
            FleetId = null,
            Role = UserRole.Customer,
            Phone = $"+4206091{suffix[..5]}",
            DisplayName = "Jan Novak",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        };

        using (var scope = fixture.Factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
            db.Fleets.Add(fleet);
            db.Users.Add(customer);
            await db.SaveChangesAsync(ct);
        }

        var client = fixture.Factory.CreateClient();
        client.AsCustomer(customer.Id);
        client.DefaultRequestHeaders.Add("X-Fleet-Slug", fleet.Slug);

        var response = await client.PostAsJsonAsync("api/v1/orders", new CreateOrderRequest
        {
            PickupAddress = "Wenceslas Square",
            PickupLat = 50.0810,
            PickupLng = 14.4260,
            Passengers = 1,
            PriceType = PriceType.Meter
        }, ct);

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var body = await response.Content.ReadFromJsonAsync<CreateOrderResponse>(JsonOptions, ct);
        body!.TrackingCode.Should().NotBeNullOrEmpty();
        body.TrackingToken.Should().NotBeNullOrEmpty();
        body.TrackingUrlPath.Should().Be($"/c/t/{body.TrackingCode}?k={body.TrackingToken}");

        // The returned token must validate against the created order via the public track endpoint.
        var trackResponse = await client.GetAsync(
            $"api/v1/public/track/{body.TrackingCode}?k={body.TrackingToken}", ct);
        // Customer client carries a bearer token but the endpoint is anonymous; X-Fleet-Slug resolves the fleet.
        trackResponse.StatusCode.Should().Be(HttpStatusCode.OK);
    }
}

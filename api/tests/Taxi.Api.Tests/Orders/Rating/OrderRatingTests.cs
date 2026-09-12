using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Common.Orders;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Features.Orders.RateOrder;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Orders.Rating;

/// <summary>Integration tests for POST orders/{id}/rating (A-rating) and the dispatcher
/// order-detail rating display (AC #7).</summary>
[Collection(TestCollections.Database)]
public sealed class OrderRatingTests(PostgresFixture fixture)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        Converters = { new System.Text.Json.Serialization.JsonStringEnumConverter() }
    };

    private static Fleet BuildFleet(string slugSuffix) => new()
    {
        Id = Guid.CreateVersion7(),
        Slug = $"rate-{slugSuffix}",
        Name = $"Rate Fleet {slugSuffix}",
        Phone = "+420605000001",
        Currency = "CZK",
        TimeZone = "Europe/Prague",
        IsActive = true,
        CreatedAt = DateTimeOffset.UtcNow
    };

    private static User BuildCustomer(string phoneSuffix) => new()
    {
        Id = Guid.CreateVersion7(),
        FleetId = null,
        Role = UserRole.Customer,
        Phone = $"+420606{phoneSuffix}",
        DisplayName = "Customer",
        IsActive = true,
        CreatedAt = DateTimeOffset.UtcNow
    };

    private static User BuildDispatcher(Guid fleetId, string phoneSuffix) => new()
    {
        Id = Guid.CreateVersion7(),
        FleetId = fleetId,
        Role = UserRole.Dispatcher,
        Phone = $"+420605{phoneSuffix}",
        DisplayName = "Dispatcher",
        IsActive = true,
        CreatedAt = DateTimeOffset.UtcNow
    };

    private static Order BuildOrder(Guid fleetId, Guid? customerUserId, string code,
        OrderStatus status = OrderStatus.Completed) => new()
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleetId,
            PublicCode = code,
            Status = status,
            Source = OrderSource.App,
            CustomerUserId = customerUserId,
            CustomerPhone = "+420606000009",
            PickupAddress = "Namesti Miru",
            PickupLat = 50.0755,
            PickupLng = 14.4378,
            PriceType = PriceType.Meter,
            FinalPriceCzk = status == OrderStatus.Completed ? 250 : null,
            CompletedAt = status == OrderStatus.Completed ? DateTimeOffset.UtcNow : null,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow,
            Version = 1
        };

    private async Task SeedAsync(Fleet fleet, IEnumerable<User> users, params Order[] orders)
    {
        var ct = TestContext.Current.CancellationToken;
        using var scope = fixture.Factory.Services.CreateScope();
        var tenant = scope.ServiceProvider.GetRequiredService<CurrentTenant>();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.Fleets.Add(fleet);
        foreach (var u in users) db.Users.Add(u);
        await db.SaveChangesAsync(ct);
        tenant.FleetId = fleet.Id;
        foreach (var o in orders) db.Orders.Add(o);
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Owner rates their completed order → 204 and the rating is stored.</summary>
    [Fact]
    public async Task Rate_CompletedOwnOrder_StoresRating()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var fleet = BuildFleet(suffix);
        var customer = BuildCustomer($"0{suffix[..6]}");
        var order = BuildOrder(fleet.Id, customer.Id, $"R{suffix[..5]}");
        await SeedAsync(fleet, [customer], order);

        var client = fixture.Factory.CreateClient();
        client.AsCustomer(customer.Id);
        client.DefaultRequestHeaders.Add("X-Fleet-Slug", fleet.Slug);

        var response = await client.PostAsJsonAsync($"api/v1/orders/{order.Id}/rating",
            new RateOrderRequest { Stars = 5, Comment = "Vyborny ridic" }, ct);
        response.StatusCode.Should().Be(HttpStatusCode.NoContent);

        using var verify = fixture.Factory.Services.CreateScope();
        var tenant = verify.ServiceProvider.GetRequiredService<CurrentTenant>();
        tenant.FleetId = fleet.Id;
        var db = verify.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var stored = await db.Orders.AsNoTracking().FirstAsync(o => o.Id == order.Id, ct);
        stored.RatingStars.Should().Be(5);
        stored.RatingComment.Should().Be("Vyborny ridic");
        stored.RatedAt.Should().NotBeNull();
    }

    /// <summary>Rating twice → 409 Order.AlreadyRated.</summary>
    [Fact]
    public async Task Rate_Twice_Returns409AlreadyRated()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var fleet = BuildFleet(suffix);
        var customer = BuildCustomer($"1{suffix[..6]}");
        var order = BuildOrder(fleet.Id, customer.Id, $"R{suffix[..5]}");
        await SeedAsync(fleet, [customer], order);

        var client = fixture.Factory.CreateClient();
        client.AsCustomer(customer.Id);
        client.DefaultRequestHeaders.Add("X-Fleet-Slug", fleet.Slug);

        var first = await client.PostAsJsonAsync($"api/v1/orders/{order.Id}/rating",
            new RateOrderRequest { Stars = 4 }, ct);
        first.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var second = await client.PostAsJsonAsync($"api/v1/orders/{order.Id}/rating",
            new RateOrderRequest { Stars = 3 }, ct);
        second.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    /// <summary>Rating a non-completed order → 409 Order.NotCompleted.</summary>
    [Fact]
    public async Task Rate_NotCompleted_Returns409()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var fleet = BuildFleet(suffix);
        var customer = BuildCustomer($"2{suffix[..6]}");
        var order = BuildOrder(fleet.Id, customer.Id, $"R{suffix[..5]}", OrderStatus.InProgress);
        await SeedAsync(fleet, [customer], order);

        var client = fixture.Factory.CreateClient();
        client.AsCustomer(customer.Id);
        client.DefaultRequestHeaders.Add("X-Fleet-Slug", fleet.Slug);

        var response = await client.PostAsJsonAsync($"api/v1/orders/{order.Id}/rating",
            new RateOrderRequest { Stars = 5 }, ct);
        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    /// <summary>A non-owner customer rating → 404 (no-leak).</summary>
    [Fact]
    public async Task Rate_NotOwner_Returns404()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var fleet = BuildFleet(suffix);
        var owner = BuildCustomer($"3{suffix[..6]}");
        var other = BuildCustomer($"4{suffix[..6]}");
        var order = BuildOrder(fleet.Id, owner.Id, $"R{suffix[..5]}");
        await SeedAsync(fleet, [owner, other], order);

        var client = fixture.Factory.CreateClient();
        client.AsCustomer(other.Id);
        client.DefaultRequestHeaders.Add("X-Fleet-Slug", fleet.Slug);

        var response = await client.PostAsJsonAsync($"api/v1/orders/{order.Id}/rating",
            new RateOrderRequest { Stars = 5 }, ct);
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    /// <summary>Stars out of range → 400 (validator).</summary>
    [Fact]
    public async Task Rate_StarsOutOfRange_Returns400()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var fleet = BuildFleet(suffix);
        var customer = BuildCustomer($"5{suffix[..6]}");
        var order = BuildOrder(fleet.Id, customer.Id, $"R{suffix[..5]}");
        await SeedAsync(fleet, [customer], order);

        var client = fixture.Factory.CreateClient();
        client.AsCustomer(customer.Id);
        client.DefaultRequestHeaders.Add("X-Fleet-Slug", fleet.Slug);

        var response = await client.PostAsJsonAsync($"api/v1/orders/{order.Id}/rating",
            new RateOrderRequest { Stars = 9 }, ct);
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    /// <summary>Cross-tenant (fleet B slug) → 404 (tenant isolation).</summary>
    [Fact]
    public async Task Rate_CrossTenant_Returns404()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffixA = Guid.NewGuid().ToString("N")[..8];
        var suffixB = Guid.NewGuid().ToString("N")[..8];
        var fleetA = BuildFleet(suffixA);
        var fleetB = BuildFleet(suffixB);
        var customer = BuildCustomer($"6{suffixA[..6]}");
        var order = BuildOrder(fleetA.Id, customer.Id, $"R{suffixA[..5]}");

        using (var scope = fixture.Factory.Services.CreateScope())
        {
            var tenant = scope.ServiceProvider.GetRequiredService<CurrentTenant>();
            var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
            db.Fleets.Add(fleetA);
            db.Fleets.Add(fleetB);
            db.Users.Add(customer);
            await db.SaveChangesAsync(ct);
            tenant.FleetId = fleetA.Id;
            db.Orders.Add(order);
            await db.SaveChangesAsync(ct);
        }

        // Owner customer uses fleet B's slug — order A scoped out → 404.
        var client = fixture.Factory.CreateClient();
        client.AsCustomer(customer.Id);
        client.DefaultRequestHeaders.Add("X-Fleet-Slug", fleetB.Slug);

        var response = await client.PostAsJsonAsync($"api/v1/orders/{order.Id}/rating",
            new RateOrderRequest { Stars = 5 }, ct);
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    /// <summary>Dispatcher order-detail after rating includes stars (AC #7).</summary>
    [Fact]
    public async Task DispatcherOrderDetail_AfterRating_IncludesStars()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var fleet = BuildFleet(suffix);
        var customer = BuildCustomer($"7{suffix[..6]}");
        var dispatcher = BuildDispatcher(fleet.Id, $"7{suffix[..6]}");
        var order = BuildOrder(fleet.Id, customer.Id, $"R{suffix[..5]}");
        await SeedAsync(fleet, [customer, dispatcher], order);

        // Customer rates.
        var custClient = fixture.Factory.CreateClient();
        custClient.AsCustomer(customer.Id);
        custClient.DefaultRequestHeaders.Add("X-Fleet-Slug", fleet.Slug);
        var rateResp = await custClient.PostAsJsonAsync($"api/v1/orders/{order.Id}/rating",
            new RateOrderRequest { Stars = 4, Comment = "Dobre" }, ct);
        rateResp.StatusCode.Should().Be(HttpStatusCode.NoContent);

        // Dispatcher reads the detail.
        var dispClient = fixture.Factory.CreateClient();
        dispClient.AsDispatcher(fleet.Id, dispatcher.Id);
        var detailResp = await dispClient.GetAsync($"api/v1/orders/{order.Id}", ct);
        detailResp.StatusCode.Should().Be(HttpStatusCode.OK);

        var raw = await detailResp.Content.ReadAsStringAsync(ct);
        var doc = JsonSerializer.Deserialize<JsonElement>(raw, JsonOptions);
        var detail = doc.GetProperty("order");
        detail.GetProperty("ratingStars").GetInt32().Should().Be(4);
        detail.GetProperty("ratingComment").GetString().Should().Be("Dobre");
    }
}

using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Common.Orders;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Features.Orders.GetMyActiveOrder;
using Taxi.Api.Features.Orders.ListMyOrders;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Orders.Mine;

/// <summary>Integration tests for the customer "my orders" reads (A-my-orders):
/// GET orders/mine/active and GET orders/mine. Own-rows + tenant isolation.</summary>
[Collection(TestCollections.Database)]
public sealed class MyOrdersTests(PostgresFixture fixture)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private static Fleet BuildFleet(string slugSuffix) => new()
    {
        Id = Guid.CreateVersion7(),
        Slug = $"mine-{slugSuffix}",
        Name = $"Mine Fleet {slugSuffix}",
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

    private static Order BuildOrder(Guid fleetId, Guid? customerUserId, string code,
        OrderStatus status, DateTimeOffset? createdAt = null) => new()
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
            CompletedAt = status == OrderStatus.Completed ? DateTimeOffset.UtcNow : null,
            CreatedAt = createdAt ?? DateTimeOffset.UtcNow,
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

    private HttpClient CustomerClient(Fleet fleet, Guid customerId)
    {
        var client = fixture.Factory.CreateClient();
        client.AsCustomer(customerId);
        client.DefaultRequestHeaders.Add("X-Fleet-Slug", fleet.Slug);
        return client;
    }

    // ── orders/mine/active ────────────────────────────────────────────────────

    /// <summary>Active endpoint returns the caller's single non-terminal order.</summary>
    [Fact]
    public async Task MyActiveOrder_ReturnsNonTerminal()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var fleet = BuildFleet(suffix);
        var customer = BuildCustomer($"0{suffix[..6]}");
        var active = BuildOrder(fleet.Id, customer.Id, $"A{suffix[..5]}", OrderStatus.Accepted);
        await SeedAsync(fleet, [customer], active);

        var resp = await CustomerClient(fleet, customer.Id).GetAsync("api/v1/orders/mine/active", ct);
        resp.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await resp.Content.ReadFromJsonAsync<GetMyActiveOrderResponse>(JsonOptions, ct);
        body!.Id.Should().Be(active.Id);
        body.Status.Should().Be("Accepted");
    }

    /// <summary>No active order → 204.</summary>
    [Fact]
    public async Task MyActiveOrder_NoneActive_Returns204()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var fleet = BuildFleet(suffix);
        var customer = BuildCustomer($"1{suffix[..6]}");
        var completed = BuildOrder(fleet.Id, customer.Id, $"C{suffix[..5]}", OrderStatus.Completed);
        await SeedAsync(fleet, [customer], completed);

        var resp = await CustomerClient(fleet, customer.Id).GetAsync("api/v1/orders/mine/active", ct);
        resp.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    /// <summary>Another customer's active order is not returned.</summary>
    [Fact]
    public async Task MyActiveOrder_OtherCustomer_NotReturned()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var fleet = BuildFleet(suffix);
        var owner = BuildCustomer($"2{suffix[..6]}");
        var other = BuildCustomer($"3{suffix[..6]}");
        var ownersOrder = BuildOrder(fleet.Id, owner.Id, $"O{suffix[..5]}", OrderStatus.Accepted);
        await SeedAsync(fleet, [owner, other], ownersOrder);

        var resp = await CustomerClient(fleet, other.Id).GetAsync("api/v1/orders/mine/active", ct);
        resp.StatusCode.Should().Be(HttpStatusCode.NoContent, "the order belongs to another customer");
    }

    // ── orders/mine (paged) ─────────────────────────────────────────────────

    /// <summary>Paged listing returns the caller's own orders in the standard shape.</summary>
    [Fact]
    public async Task MyOrders_ListsOwnOrdersPaged()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var fleet = BuildFleet(suffix);
        var customer = BuildCustomer($"4{suffix[..6]}");
        var o1 = BuildOrder(fleet.Id, customer.Id, $"P{suffix[..5]}", OrderStatus.Completed,
            DateTimeOffset.UtcNow.AddMinutes(-10));
        var o2 = BuildOrder(fleet.Id, customer.Id, $"Q{suffix[..5]}", OrderStatus.New,
            DateTimeOffset.UtcNow.AddMinutes(-5));
        await SeedAsync(fleet, [customer], o1, o2);

        var resp = await CustomerClient(fleet, customer.Id)
            .GetAsync("api/v1/orders/mine?page=1&pageSize=10", ct);
        resp.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await resp.Content.ReadFromJsonAsync<ListMyOrdersResponse>(JsonOptions, ct);
        body!.Total.Should().Be(2);
        body.Page.Should().Be(1);
        body.PageSize.Should().Be(10);
        body.Items.Should().HaveCount(2);
        // Newest first.
        body.Items[0].Id.Should().Be(o2.Id);
    }

    /// <summary>Another customer's orders never appear in the paged listing.</summary>
    [Fact]
    public async Task MyOrders_OtherCustomer_NotReturned()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var fleet = BuildFleet(suffix);
        var owner = BuildCustomer($"5{suffix[..6]}");
        var other = BuildCustomer($"6{suffix[..6]}");
        var ownersOrder = BuildOrder(fleet.Id, owner.Id, $"Z{suffix[..5]}", OrderStatus.Completed);
        await SeedAsync(fleet, [owner, other], ownersOrder);

        var resp = await CustomerClient(fleet, other.Id)
            .GetAsync("api/v1/orders/mine?page=1&pageSize=10", ct);
        resp.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await resp.Content.ReadFromJsonAsync<ListMyOrdersResponse>(JsonOptions, ct);
        body!.Total.Should().Be(0);
        body.Items.Should().BeEmpty();
    }

    /// <summary>Cross-tenant: a customer using the wrong fleet slug sees none of their fleet-A orders.</summary>
    [Fact]
    public async Task MyOrders_CrossTenant_ReturnsOwnFleetOnly()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffixA = Guid.NewGuid().ToString("N")[..8];
        var suffixB = Guid.NewGuid().ToString("N")[..8];
        var fleetA = BuildFleet(suffixA);
        var fleetB = BuildFleet(suffixB);
        var customer = BuildCustomer($"7{suffixA[..6]}");
        var orderA = BuildOrder(fleetA.Id, customer.Id, $"T{suffixA[..5]}", OrderStatus.Accepted);

        using (var scope = fixture.Factory.Services.CreateScope())
        {
            var tenant = scope.ServiceProvider.GetRequiredService<CurrentTenant>();
            var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
            db.Fleets.Add(fleetA);
            db.Fleets.Add(fleetB);
            db.Users.Add(customer);
            await db.SaveChangesAsync(ct);
            tenant.FleetId = fleetA.Id;
            db.Orders.Add(orderA);
            await db.SaveChangesAsync(ct);
        }

        // Customer uses fleet B's slug — order A scoped out for BOTH endpoints.
        var client = CustomerClient(fleetB, customer.Id);

        var listResp = await client.GetAsync("api/v1/orders/mine?page=1&pageSize=10", ct);
        listResp.StatusCode.Should().Be(HttpStatusCode.OK);
        var listBody = await listResp.Content.ReadFromJsonAsync<ListMyOrdersResponse>(JsonOptions, ct);
        listBody!.Total.Should().Be(0, "order A is in fleet A; scoping to fleet B yields nothing");

        var activeResp = await client.GetAsync("api/v1/orders/mine/active", ct);
        activeResp.StatusCode.Should().Be(HttpStatusCode.NoContent,
            "order A is in fleet A; scoping to fleet B yields no active order");
    }
}

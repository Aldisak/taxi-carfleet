using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Notifications;

/// <summary>Integration tests for POST/DELETE /push/subscriptions (A2) — multi-device upsert,
/// UserId scoping, validation, and auth.</summary>
[Collection(TestCollections.Database)]
public sealed class PushSubscriptionTests(PostgresFixture fixture)
{
    private static object SubBody(string endpoint, string p256dh = "key-p256", string auth = "key-auth", string? userAgent = null)
        => new { endpoint, p256dh, auth, userAgent };

    private async Task<int> CountSubsAsync(Guid userId, CancellationToken ct)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        return await db.PushSubscriptions.IgnoreQueryFilters()
            .CountAsync(p => p.UserId == userId, ct);
    }

    /// <summary>Seeds a real customer User row so the push_subscriptions.user_id FK is satisfied.</summary>
    private async Task SeedCustomerUserAsync(Guid userId, CancellationToken ct)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.Users.Add(new User
        {
            Id = userId,
            FleetId = null,
            Role = UserRole.Customer,
            Phone = $"+420609{Guid.NewGuid().ToString("N")[..9]}",
            DisplayName = "Push Customer",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Seeds a fleet + a driver User so a driver JWT maps to a real user row.</summary>
    private async Task SeedDriverUserAsync(Guid fleetId, Guid userId, CancellationToken ct)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.Fleets.Add(new Fleet
        {
            Id = fleetId,
            Slug = $"push-{Guid.NewGuid().ToString("N")[..8]}",
            Name = "Push Fleet",
            Phone = "+420609000001",
            Currency = "CZK",
            TimeZone = "Europe/Prague",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        });
        db.Users.Add(new User
        {
            Id = userId,
            FleetId = fleetId,
            Role = UserRole.Driver,
            Phone = $"+420609{Guid.NewGuid().ToString("N")[..9]}",
            DisplayName = "Push Driver",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync(ct);
    }

    [Fact]
    public async Task PushSubscribe_NewEndpoint_Inserts()
    {
        var ct = TestContext.Current.CancellationToken;
        var userId = Guid.CreateVersion7();
        await SeedCustomerUserAsync(userId, ct);
        var client = fixture.Factory.CreateClient().AsCustomer(userId);

        var resp = await client.PostAsJsonAsync("/api/v1/push/subscriptions",
            SubBody("https://push.example/endpoint-1"), ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        (await CountSubsAsync(userId, ct)).Should().Be(1);
    }

    [Fact]
    public async Task PushSubscribe_SameEndpointTwice_Upserts()
    {
        var ct = TestContext.Current.CancellationToken;
        var userId = Guid.CreateVersion7();
        await SeedCustomerUserAsync(userId, ct);
        var client = fixture.Factory.CreateClient().AsCustomer(userId);

        await client.PostAsJsonAsync("/api/v1/push/subscriptions",
            SubBody("https://push.example/same", p256dh: "old", auth: "old"), ct);
        var resp2 = await client.PostAsJsonAsync("/api/v1/push/subscriptions",
            SubBody("https://push.example/same", p256dh: "new", auth: "new"), ct);

        resp2.StatusCode.Should().Be(HttpStatusCode.OK);
        (await CountSubsAsync(userId, ct)).Should().Be(1, "same endpoint upserts, no duplicate");

        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var sub = await db.PushSubscriptions.IgnoreQueryFilters()
            .FirstAsync(p => p.UserId == userId, ct);
        sub.P256dh.Should().Be("new");
        sub.Auth.Should().Be("new");
    }

    [Fact]
    public async Task PushSubscribe_MultipleDevices_AllPersist()
    {
        var ct = TestContext.Current.CancellationToken;
        var userId = Guid.CreateVersion7();
        await SeedCustomerUserAsync(userId, ct);
        var client = fixture.Factory.CreateClient().AsCustomer(userId);

        await client.PostAsJsonAsync("/api/v1/push/subscriptions", SubBody("https://push.example/dev-a"), ct);
        await client.PostAsJsonAsync("/api/v1/push/subscriptions", SubBody("https://push.example/dev-b"), ct);

        (await CountSubsAsync(userId, ct)).Should().Be(2, "different endpoints = different devices");
    }

    [Fact]
    public async Task PushSubscribe_MissingEndpoint_Returns400()
    {
        var ct = TestContext.Current.CancellationToken;
        var client = fixture.Factory.CreateClient().AsCustomer();

        var resp = await client.PostAsJsonAsync("/api/v1/push/subscriptions",
            new { endpoint = "", p256dh = "x", auth = "y" }, ct);

        resp.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task PushUnsubscribe_RemovesOwnEndpoint()
    {
        var ct = TestContext.Current.CancellationToken;
        var userId = Guid.CreateVersion7();
        await SeedCustomerUserAsync(userId, ct);
        var client = fixture.Factory.CreateClient().AsCustomer(userId);

        await client.PostAsJsonAsync("/api/v1/push/subscriptions", SubBody("https://push.example/del-me"), ct);
        (await CountSubsAsync(userId, ct)).Should().Be(1);

        var del = new HttpRequestMessage(HttpMethod.Delete, "/api/v1/push/subscriptions")
        {
            Content = JsonContent.Create(new { endpoint = "https://push.example/del-me" })
        };
        var resp = await client.SendAsync(del, ct);

        resp.StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await CountSubsAsync(userId, ct)).Should().Be(0);
    }

    [Fact]
    public async Task PushUnsubscribe_Unknown_Returns204NoLeak()
    {
        var ct = TestContext.Current.CancellationToken;
        var client = fixture.Factory.CreateClient().AsCustomer();

        var del = new HttpRequestMessage(HttpMethod.Delete, "/api/v1/push/subscriptions")
        {
            Content = JsonContent.Create(new { endpoint = "https://push.example/never-existed" })
        };
        var resp = await client.SendAsync(del, ct);

        resp.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task PushSubscribe_Anonymous_Returns401()
    {
        var ct = TestContext.Current.CancellationToken;
        var client = fixture.Factory.CreateClient();

        var resp = await client.PostAsJsonAsync("/api/v1/push/subscriptions",
            SubBody("https://push.example/anon"), ct);

        resp.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task PushSubscribe_CustomerAndDriver_BothAllowed()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleetId = Guid.CreateVersion7();
        var customerId = Guid.CreateVersion7();
        var driverUserId = Guid.CreateVersion7();
        await SeedCustomerUserAsync(customerId, ct);
        await SeedDriverUserAsync(fleetId, driverUserId, ct);

        var customerClient = fixture.Factory.CreateClient().AsCustomer(customerId);
        var driverClient = fixture.Factory.CreateClient().AsDriver(fleetId, driverUserId);

        var r1 = await customerClient.PostAsJsonAsync("/api/v1/push/subscriptions",
            SubBody("https://push.example/cust"), ct);
        var r2 = await driverClient.PostAsJsonAsync("/api/v1/push/subscriptions",
            SubBody("https://push.example/driver"), ct);

        r1.StatusCode.Should().Be(HttpStatusCode.OK);
        r2.StatusCode.Should().Be(HttpStatusCode.OK);
    }
}

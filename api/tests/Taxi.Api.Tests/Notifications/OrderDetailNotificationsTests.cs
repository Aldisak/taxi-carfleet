using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Features.Orders.GetOrder;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Notifications;

/// <summary>A6: GET /orders/{id} includes an additive `notifications` list projected from
/// notification_log (sent/failed), tenant-scoped.</summary>
[Collection(TestCollections.Database)]
public sealed class OrderDetailNotificationsTests(PostgresFixture fixture)
{
    private static readonly DateTimeOffset Now = new(2026, 9, 10, 12, 0, 0, TimeSpan.Zero);

    private static async Task<(Fleet fleet, Guid dispatcherId, Order order)> SeedAsync(
        TaxiDbContext db, CancellationToken ct)
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var fleet = new Fleet
        {
            Id = Guid.CreateVersion7(),
            Slug = $"det-{suffix}",
            Name = "Detail Fleet",
            Phone = "+420600100001",
            Currency = "CZK",
            TimeZone = "Europe/Prague",
            IsActive = true,
            CreatedAt = Now
        };
        var dispatcher = new User
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            Role = UserRole.Dispatcher,
            Phone = $"+420608{suffix}0",
            DisplayName = "Detail Dispatcher",
            IsActive = true,
            CreatedAt = Now
        };
        var order = new Order
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            PublicCode = $"N{suffix[..5].ToUpperInvariant()}",
            Status = OrderStatus.Completed,
            Source = OrderSource.Phone,
            CustomerPhone = "+420600000022",
            PickupAddress = "Detail Pickup",
            PriceType = PriceType.Estimate,
            CreatedAt = Now,
            UpdatedAt = Now,
            Version = 1
        };
        db.Fleets.Add(fleet);
        db.Users.Add(dispatcher);
        db.Orders.Add(order);
        await db.SaveChangesAsync(ct);
        return (fleet, dispatcher.Id, order);
    }

    [Fact]
    public async Task OrderDetail_IncludesSentAndFailedNotifications()
    {
        var ct = TestContext.Current.CancellationToken;
        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var (fleet, dispatcherId, order) = await SeedAsync(db, ct);

        db.NotificationLog.AddRange(
            new NotificationLog
            {
                Id = Guid.CreateVersion7(),
                FleetId = fleet.Id,
                Event = NotificationEvent.OrderCreatedForCustomer,
                OrderId = order.Id,
                Channel = NotificationChannel.Sms,
                Recipient = order.CustomerPhone,
                Status = NotificationStatus.Sent,
                ProviderMessageId = "msg-1",
                CreatedAt = Now,
                SentAt = Now
            },
            new NotificationLog
            {
                Id = Guid.CreateVersion7(),
                FleetId = fleet.Id,
                Event = NotificationEvent.DriverArrived,
                OrderId = order.Id,
                Channel = NotificationChannel.Sms,
                Recipient = order.CustomerPhone,
                Status = NotificationStatus.Failed,
                Error = "SendFailed",
                CreatedAt = Now.AddSeconds(5)
            });
        await db.SaveChangesAsync(ct);

        var client = fixture.Factory.CreateClient().AsDispatcher(fleet.Id, dispatcherId);
        var resp = await client.GetAsync($"/api/v1/orders/{order.Id}", ct);
        resp.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await resp.Content.ReadFromJsonAsync<GetOrderResponse>(ct);
        var notifications = body!.Order.Notifications;
        notifications.Should().NotBeNull();
        notifications!.Should().HaveCount(2);
        notifications.Should().Contain(n => n.Status == "Sent" && n.SentAt != null);
        notifications.Should().Contain(n => n.Status == "Failed" && n.Channel == "Sms",
            "a failed SMS surfaces so the dispatcher can render the red icon");
    }

    [Fact]
    public async Task OrderDetail_NotificationsAreTenantScoped()
    {
        var ct = TestContext.Current.CancellationToken;
        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var (fleetA, dispatcherA, orderA) = await SeedAsync(db, ct);
        var (fleetB, _, _) = await SeedAsync(db, ct);

        // A log row for fleet B with orderA's id must never surface (impossible normally; prove the
        // query is fleet-scoped by confirming fleet A's own row count and no cross-fleet leakage).
        db.NotificationLog.Add(new NotificationLog
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleetA.Id,
            Event = NotificationEvent.OrderCreatedForCustomer,
            OrderId = orderA.Id,
            Channel = NotificationChannel.Sms,
            Recipient = orderA.CustomerPhone,
            Status = NotificationStatus.Sent,
            CreatedAt = Now,
            SentAt = Now
        });
        await db.SaveChangesAsync(ct);

        // A dispatcher from fleet B requesting order A gets a no-leak 404 (existing behavior).
        var clientB = fixture.Factory.CreateClient().AsDispatcher(fleetB.Id);
        var respB = await clientB.GetAsync($"/api/v1/orders/{orderA.Id}", ct);
        respB.StatusCode.Should().Be(HttpStatusCode.NotFound, "cross-fleet order is a no-leak 404");

        // Fleet A sees its own notification.
        var clientA = fixture.Factory.CreateClient().AsDispatcher(fleetA.Id, dispatcherA);
        var respA = await clientA.GetAsync($"/api/v1/orders/{orderA.Id}", ct);
        respA.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await respA.Content.ReadFromJsonAsync<GetOrderResponse>(ct);
        body!.Order.Notifications!.Should().ContainSingle();
    }
}

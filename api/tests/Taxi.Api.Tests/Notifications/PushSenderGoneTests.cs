using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Infrastructure.Jobs;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Notifications;

/// <summary>AC#4: a push send whose provider returns 410 Gone deletes the matching subscription.</summary>
[Collection(TestCollections.Database)]
public sealed class PushSenderGoneTests(PostgresFixture fixture)
{
    private static readonly DateTimeOffset Now = new(2026, 9, 10, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task PushSender_Returns410_DeletesSubscription()
    {
        var ct = TestContext.Current.CancellationToken;
        using var factory = new NotificationTestFactory(fixture.ConnectionString);
        factory.Push.ReturnGone = true;

        var suffix = Guid.NewGuid().ToString("N")[..8];
        Guid subId;
        Guid orderId;
        Guid fleetId;

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
            var fleet = new Fleet
            {
                Id = Guid.CreateVersion7(),
                Slug = $"gone-{suffix}",
                Name = "Gone Fleet",
                Phone = "+420600300001",
                Currency = "CZK",
                TimeZone = "Europe/Prague",
                IsActive = true,
                CreatedAt = Now
            };
            var customer = new User
            {
                Id = Guid.CreateVersion7(),
                FleetId = null,
                Role = UserRole.Customer,
                Phone = $"+420609{suffix}0",
                DisplayName = "Gone Customer",
                IsActive = true,
                CreatedAt = Now
            };
            db.Fleets.Add(fleet);
            db.Users.Add(customer);
            await db.SaveChangesAsync(ct);
            fleetId = fleet.Id;

            var sub = new PushSubscription
            {
                Id = Guid.CreateVersion7(),
                FleetId = null,
                UserId = customer.Id,
                Endpoint = "https://push.example/gone",
                P256dh = "k",
                Auth = "a",
                CreatedAt = Now
            };
            db.PushSubscriptions.Add(sub);
            subId = sub.Id;

            var order = new Order
            {
                Id = Guid.CreateVersion7(),
                FleetId = fleet.Id,
                PublicCode = $"G{suffix[..5].ToUpperInvariant()}",
                Status = OrderStatus.InProgress,
                Source = OrderSource.App,
                CustomerUserId = customer.Id,
                CustomerPhone = "+420600000044",
                PickupAddress = "Gone Pickup",
                PriceType = PriceType.Estimate,
                CreatedAt = Now,
                UpdatedAt = Now,
                Version = 1
            };
            db.Orders.Add(order);
            orderId = order.Id;

            // RideStarted → push only to the customer.
            db.NotificationOutbox.Add(new NotificationOutbox
            {
                Id = Guid.CreateVersion7(),
                FleetId = fleet.Id,
                Event = NotificationEvent.RideStarted,
                OrderId = order.Id,
                Channel = NotificationChannel.Push,
                RecipientUserId = customer.Id,
                Status = NotificationStatus.Queued,
                NextAttemptAt = Now,
                CreatedAt = Now
            });
            await db.SaveChangesAsync(ct);
        }

        var job = new NotificationDispatchJob(
            factory.Services.GetRequiredService<IServiceScopeFactory>(),
            factory.FakeTime,
            NullLogger<NotificationDispatchJob>.Instance);
        await job.RunTickAsync(ct);

        factory.Push.SendCount.Should().BeGreaterThan(0, "the push sender was invoked");

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
            var exists = await db.PushSubscriptions.IgnoreQueryFilters()
                .AnyAsync(p => p.Id == subId, ct);
            exists.Should().BeFalse("a 410 Gone subscription is deleted (AC#4)");
        }
    }
}

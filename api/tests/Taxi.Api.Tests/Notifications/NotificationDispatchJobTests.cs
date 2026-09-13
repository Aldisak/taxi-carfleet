using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Infrastructure.Jobs;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Notifications;

/// <summary>Dispatch-job integration tests (A5): 3× send failure → Failed (AC#3), and duplicate
/// outbox rows → sender invoked exactly once (AC#7, claim-then-execute at the SEND boundary).</summary>
[Collection(TestCollections.Database)]
public sealed class NotificationDispatchJobTests(PostgresFixture fixture)
{
    private static readonly DateTimeOffset Now = new(2026, 9, 10, 12, 0, 0, TimeSpan.Zero);

    private static async Task<Fleet> SeedFleetAsync(TaxiDbContext db, CancellationToken ct)
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var fleet = new Fleet
        {
            Id = Guid.CreateVersion7(),
            Slug = $"djob-{suffix}",
            Name = "Dispatch Job Fleet",
            Phone = "+420600400001",
            Currency = "CZK",
            TimeZone = "Europe/Prague",
            IsActive = true,
            CreatedAt = Now
        };
        db.Fleets.Add(fleet);
        await db.SaveChangesAsync(ct);
        return fleet;
    }

    private static async Task<Order> SeedOrderAsync(TaxiDbContext db, Guid fleetId, CancellationToken ct)
    {
        var order = new Order
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleetId,
            PublicCode = $"J{Guid.NewGuid():N}"[..6].ToUpperInvariant(),
            Status = OrderStatus.New,
            Source = OrderSource.Phone,
            CustomerPhone = "+420600000055",
            PickupAddress = "Job Pickup",
            PriceType = PriceType.Estimate,
            CreatedAt = Now,
            UpdatedAt = Now,
            Version = 1
        };
        db.Orders.Add(order);
        await db.SaveChangesAsync(ct);
        return order;
    }

    private static NotificationOutbox BuildSmsOutbox(Guid fleetId, Guid orderId, string phone) => new()
    {
        Id = Guid.CreateVersion7(),
        FleetId = fleetId,
        Event = NotificationEvent.OrderCreatedForCustomer,
        OrderId = orderId,
        Channel = NotificationChannel.Sms,
        RecipientPhone = phone,
        Status = NotificationStatus.Queued,
        Attempts = 0,
        NextAttemptAt = Now,
        CreatedAt = Now
    };

    [Fact]
    public async Task NotificationDispatchJob_SendFailsThreeTimes_MarksFailed()
    {
        var ct = TestContext.Current.CancellationToken;
        using var factory = new NotificationTestFactory(fixture.ConnectionString);
        factory.Sms.FailAll = true;

        Guid fleetId;
        Guid orderId;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
            var fleet = await SeedFleetAsync(db, ct);
            var order = await SeedOrderAsync(db, fleet.Id, ct);
            fleetId = fleet.Id;
            orderId = order.Id;
            db.NotificationOutbox.Add(BuildSmsOutbox(fleet.Id, order.Id, order.CustomerPhone));
            await db.SaveChangesAsync(ct);
        }

        var job = new NotificationDispatchJob(
            factory.Services.GetRequiredService<IServiceScopeFactory>(),
            factory.FakeTime,
            NullLogger<NotificationDispatchJob>.Instance);

        // Three ticks, advancing time past each backoff window.
        await job.RunTickAsync(ct);
        factory.FakeTime.Advance(TimeSpan.FromMinutes(1));
        await job.RunTickAsync(ct);
        factory.FakeTime.Advance(TimeSpan.FromMinutes(1));
        await job.RunTickAsync(ct);

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
            var outbox = await db.NotificationOutbox.IgnoreQueryFilters().AsNoTracking()
                .FirstAsync(o => o.OrderId == orderId, ct);
            outbox.Status.Should().Be(NotificationStatus.Failed, "3 failed attempts → Failed");
            outbox.Attempts.Should().Be(3);

            var log = await db.NotificationLog.IgnoreQueryFilters().AsNoTracking()
                .FirstAsync(l => l.OrderId == orderId, ct);
            log.Status.Should().Be(NotificationStatus.Failed);
        }
    }

    [Fact]
    public async Task NotificationDispatchJob_DuplicateOutbox_InvokesSenderOnce()
    {
        var ct = TestContext.Current.CancellationToken;
        using var factory = new NotificationTestFactory(fixture.ConnectionString);

        Guid orderId;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
            var fleet = await SeedFleetAsync(db, ct);
            var order = await SeedOrderAsync(db, fleet.Id, ct);
            orderId = order.Id;

            // TWO outbox rows for the same (event, order, recipient, channel).
            db.NotificationOutbox.Add(BuildSmsOutbox(fleet.Id, order.Id, order.CustomerPhone));
            db.NotificationOutbox.Add(BuildSmsOutbox(fleet.Id, order.Id, order.CustomerPhone));
            await db.SaveChangesAsync(ct);
        }

        var job = new NotificationDispatchJob(
            factory.Services.GetRequiredService<IServiceScopeFactory>(),
            factory.FakeTime,
            NullLogger<NotificationDispatchJob>.Instance);
        await job.RunTickAsync(ct);

        // The sender was invoked exactly ONCE (the claim blocks the second row before its send).
        factory.Sms.Sent.Should().ContainSingle("claim-then-execute sends exactly once");

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
            var sentLogs = await db.NotificationLog.IgnoreQueryFilters().AsNoTracking()
                .Where(l => l.OrderId == orderId && l.Status == NotificationStatus.Sent).ToListAsync(ct);
            sentLogs.Should().ContainSingle("exactly one Sent log row");
        }
    }
}

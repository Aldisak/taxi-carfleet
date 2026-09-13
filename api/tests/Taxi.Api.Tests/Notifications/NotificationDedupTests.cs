using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Common.Notifications;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Notifications;

/// <summary>A4 documents the dedup hand-off: Notify does NOT dedup at enqueue — two Notify calls may
/// enqueue two outbox rows for the same (event, order, recipient, channel), and that is fine. The
/// send-once guarantee lives at SEND time in A5 (claim-then-execute via the notification_log unique
/// index). The send-once assertion itself is A5's NotificationDispatchJob_DuplicateOutbox_InvokesSenderOnce.</summary>
[Collection(TestCollections.Database)]
public sealed class NotificationDedupTests(PostgresFixture fixture)
{
    private static readonly DateTimeOffset Now = new(2026, 9, 10, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task NotificationDedup_DuplicateNotify_EnqueuesButSendGuardedByA5()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];

        using var seedScope = fixture.Factory.Services.CreateScope();
        var seedDb = seedScope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        var fleet = new Fleet
        {
            Id = Guid.CreateVersion7(),
            Slug = $"dedup-{suffix}",
            Name = "Dedup Fleet",
            Phone = "+420600600001",
            Currency = "CZK",
            TimeZone = "Europe/Prague",
            IsActive = true,
            CreatedAt = Now
        };
        seedDb.Fleets.Add(fleet);
        await seedDb.SaveChangesAsync(ct);

        var order = new Order
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            PublicCode = $"D{suffix[..5].ToUpperInvariant()}",
            Status = OrderStatus.New,
            Source = OrderSource.Phone,
            CustomerPhone = "+420600000066",
            PickupAddress = "Dedup Pickup",
            PriceType = PriceType.Estimate,
            CreatedAt = Now,
            UpdatedAt = Now,
            Version = 1
        };
        seedDb.Orders.Add(order);
        await seedDb.SaveChangesAsync(ct);

        // Two Notify calls in the same scope → the engine enqueues (no enqueue-time dedup).
        using var scope = fixture.Factory.Services.CreateScope();
        scope.ServiceProvider.GetRequiredService<CurrentTenant>().FleetId = fleet.Id;
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var svc = scope.ServiceProvider.GetRequiredService<INotificationService>();
        var loaded = await db.Orders.FirstAsync(o => o.Id == order.Id, ct);

        await svc.NotifyAsync(NotificationEvent.OrderCreatedForCustomer, loaded, ct);
        await svc.NotifyAsync(NotificationEvent.OrderCreatedForCustomer, loaded, ct);
        await db.SaveChangesAsync(ct);

        var rows = await seedDb.NotificationOutbox.IgnoreQueryFilters().AsNoTracking()
            .Where(o => o.OrderId == order.Id && o.Event == NotificationEvent.OrderCreatedForCustomer)
            .ToListAsync(ct);
        rows.Should().HaveCount(2, "enqueue does not dedup — the send boundary (A5) does");
    }
}

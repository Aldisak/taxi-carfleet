using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Common.Notifications;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Notifications;

/// <summary>AC#6 engine integration: with cap=2 and unit cost=1, after 2 SMS sent this month a third
/// NON-arrival SMS is recorded SkippedCap (no outbox row), while a DriverArrived SMS still enqueues.</summary>
[Collection(TestCollections.Database)]
public sealed class NotificationCapIntegrationTests(PostgresFixture fixture)
{
    private static readonly DateTimeOffset Now = new(2026, 9, 10, 12, 0, 0, TimeSpan.Zero);

    private static async Task<Fleet> SeedCappedFleetAsync(TaxiDbContext db, CancellationToken ct)
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var fleet = new Fleet
        {
            Id = Guid.CreateVersion7(),
            Slug = $"cap-{suffix}",
            Name = "Cap Fleet",
            Phone = "+420600200001",
            Currency = "CZK",
            TimeZone = "Europe/Prague",
            IsActive = true,
            CreatedAt = Now
        };
        db.Fleets.Add(fleet);
        await db.SaveChangesAsync(ct);

        // A FleetAdmin to receive the 90% warning push.
        db.Users.Add(new User
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            Role = UserRole.FleetAdmin,
            Phone = $"+420605{suffix}9",
            DisplayName = "Cap Admin",
            IsActive = true,
            CreatedAt = Now
        });

        db.FleetSettings.Add(new FleetSettings
        {
            FleetId = fleet.Id,
            SmsMonthlyCapCzk = 2,
            SmsUnitCostCzk = 1
        });

        // Seed 2 SMS "Sent" this month → cap reached.
        for (var i = 0; i < 2; i++)
        {
            db.NotificationLog.Add(new NotificationLog
            {
                Id = Guid.CreateVersion7(),
                FleetId = fleet.Id,
                Event = NotificationEvent.OrderCreatedForCustomer,
                OrderId = Guid.CreateVersion7(),
                Channel = NotificationChannel.Sms,
                Recipient = $"+42060000{i:D4}",
                Status = NotificationStatus.Sent,
                CreatedAt = Now,
                SentAt = Now
            });
        }
        await db.SaveChangesAsync(ct);
        return fleet;
    }

    private static Order BuildPhoneOrder(Guid fleetId) => new()
    {
        Id = Guid.CreateVersion7(),
        FleetId = fleetId,
        PublicCode = $"C{Guid.NewGuid():N}"[..6].ToUpperInvariant(),
        Status = OrderStatus.New,
        Source = OrderSource.Phone,
        CustomerPhone = "+420600000033",
        PickupAddress = "Cap Pickup",
        PriceType = PriceType.Estimate,
        CreatedAt = Now,
        UpdatedAt = Now,
        Version = 1
    };

    [Fact]
    public async Task NotificationCap_ThirdNonArrival_SkipsCap_ArrivalStillEnqueues()
    {
        var ct = TestContext.Current.CancellationToken;
        using var seedScope = fixture.Factory.Services.CreateScope();
        var seedDb = seedScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var fleet = await SeedCappedFleetAsync(seedDb, ct);

        var order = BuildPhoneOrder(fleet.Id);
        seedDb.Orders.Add(order);
        await seedDb.SaveChangesAsync(ct);

        using (var scope = fixture.Factory.Services.CreateScope())
        {
            scope.ServiceProvider.GetRequiredService<CurrentTenant>().FleetId = fleet.Id;
            var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
            var svc = scope.ServiceProvider.GetRequiredService<INotificationService>();
            var loaded = await db.Orders.FirstAsync(o => o.Id == order.Id, ct);

            // Non-arrival SMS over cap → SkippedCap, no outbox row.
            await svc.NotifyAsync(NotificationEvent.OrderCreatedForCustomer, loaded, ct);
            // DriverArrived SMS → always enqueues even over cap.
            await svc.NotifyAsync(NotificationEvent.DriverArrived, loaded, ct);
            await db.SaveChangesAsync(ct);
        }

        var outbox = await seedDb.NotificationOutbox.IgnoreQueryFilters().AsNoTracking()
            .Where(o => o.OrderId == order.Id).ToListAsync(ct);
        outbox.Should().Contain(o => o.Event == NotificationEvent.DriverArrived && o.Channel == NotificationChannel.Sms,
            "the DriverArrived SMS is enqueued even over cap");
        outbox.Should().NotContain(o => o.Event == NotificationEvent.OrderCreatedForCustomer,
            "the over-cap non-arrival SMS is not enqueued");

        // AC#6: the 90% warning push to the FleetAdmin was enqueued.
        outbox.Should().Contain(o => o.Event == NotificationEvent.SmsCapWarning && o.Channel == NotificationChannel.Push,
            "at/over 90% of the cap a warning push is enqueued to the FleetAdmin");

        var skipped = await seedDb.NotificationLog.IgnoreQueryFilters().AsNoTracking()
            .Where(l => l.OrderId == order.Id && l.Status == NotificationStatus.SkippedCap).ToListAsync(ct);
        skipped.Should().ContainSingle("the over-cap non-arrival SMS is logged SkippedCap");
        skipped[0].Event.Should().Be(NotificationEvent.OrderCreatedForCustomer);
    }
}

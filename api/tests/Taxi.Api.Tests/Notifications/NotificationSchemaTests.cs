using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Notifications;

/// <summary>Schema-level integration tests for the notification outbox/log tables, the dedup unique
/// index, and the FleetSettings SMS cost-cap defaults (A1).</summary>
[Collection(TestCollections.Database)]
public sealed class NotificationSchemaTests(PostgresFixture fixture)
{
    private static readonly DateTimeOffset Now = new(2026, 9, 10, 12, 0, 0, TimeSpan.Zero);

    private static async Task<Fleet> SeedFleetAsync(TaxiDbContext db, CancellationToken ct)
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var fleet = new Fleet
        {
            Id = Guid.CreateVersion7(),
            Slug = $"ntf-{suffix}",
            Name = "Notif Test Fleet",
            Phone = "+420600900001",
            Currency = "CZK",
            TimeZone = "Europe/Prague",
            IsActive = true,
            CreatedAt = Now
        };
        db.Fleets.Add(fleet);
        await db.SaveChangesAsync(ct);
        return fleet;
    }

    private IServiceScope ScopeForFleet(Guid fleetId, out TaxiDbContext db)
    {
        var scope = fixture.Factory.Services.CreateScope();
        var tenant = scope.ServiceProvider.GetRequiredService<CurrentTenant>();
        tenant.FleetId = fleetId;
        db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        return scope;
    }

    /// <summary>Fleet A cannot read fleet B's outbox/log rows through the tenant query filter.</summary>
    [Fact]
    public async Task NotificationSchema_OutboxAndLog_AreTenantScoped()
    {
        var ct = TestContext.Current.CancellationToken;

        await using var seedScope = fixture.Factory.Services.CreateAsyncScope();
        var seedDb = seedScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var fleetA = await SeedFleetAsync(seedDb, ct);
        var fleetB = await SeedFleetAsync(seedDb, ct);

        // Write one outbox + one log row for fleet A (tenant-scoped scope).
        using (var scopeA = ScopeForFleet(fleetA.Id, out var dbA))
        {
            dbA.NotificationOutbox.Add(new NotificationOutbox
            {
                Id = Guid.CreateVersion7(),
                FleetId = fleetA.Id,
                Event = NotificationEvent.OrderCreatedForCustomer,
                Channel = NotificationChannel.Sms,
                RecipientPhone = "+420600000001",
                Status = NotificationStatus.Queued,
                NextAttemptAt = Now,
                CreatedAt = Now
            });
            dbA.NotificationLog.Add(new NotificationLog
            {
                Id = Guid.CreateVersion7(),
                FleetId = fleetA.Id,
                Event = NotificationEvent.OrderCreatedForCustomer,
                Channel = NotificationChannel.Sms,
                Recipient = "+420600000001",
                Status = NotificationStatus.Sent,
                CreatedAt = Now,
                SentAt = Now
            });
            await dbA.SaveChangesAsync(ct);
        }

        // Fleet B's scope sees none of fleet A's rows.
        using (var scopeB = ScopeForFleet(fleetB.Id, out var dbB))
        {
            (await dbB.NotificationOutbox.CountAsync(ct)).Should().Be(0);
            (await dbB.NotificationLog.CountAsync(ct)).Should().Be(0);
        }

        // Fleet A sees its own rows.
        using (var scopeA2 = ScopeForFleet(fleetA.Id, out var dbA2))
        {
            (await dbA2.NotificationOutbox.CountAsync(ct)).Should().Be(1);
            (await dbA2.NotificationLog.CountAsync(ct)).Should().Be(1);
        }
    }

    /// <summary>The unique dedup index rejects a second NotificationLog with the same
    /// (FleetId, Event, OrderId, Recipient, Channel).</summary>
    [Fact]
    public async Task NotificationSchema_DedupIndex_RejectsDuplicateLogRow()
    {
        var ct = TestContext.Current.CancellationToken;

        await using var seedScope = fixture.Factory.Services.CreateAsyncScope();
        var seedDb = seedScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var fleet = await SeedFleetAsync(seedDb, ct);
        var orderId = Guid.CreateVersion7();

        NotificationLog Build() => new()
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            Event = NotificationEvent.DriverArrived,
            OrderId = orderId,
            Channel = NotificationChannel.Sms,
            Recipient = "+420600000009",
            Status = NotificationStatus.Sent,
            CreatedAt = Now,
            SentAt = Now
        };

        using (var scope1 = ScopeForFleet(fleet.Id, out var db1))
        {
            db1.NotificationLog.Add(Build());
            await db1.SaveChangesAsync(ct);
        }

        using var scope2 = ScopeForFleet(fleet.Id, out var db2);
        db2.NotificationLog.Add(Build());
        var act = async () => await db2.SaveChangesAsync(ct);
        var ex = await act.Should().ThrowAsync<DbUpdateException>();
        ex.Which.InnerException.Should().BeOfType<PostgresException>()
            .Which.SqlState.Should().Be("23505");
    }

    /// <summary>FleetSettings SmsMonthlyCapCzk/SmsUnitCostCzk default to 500/1.</summary>
    [Fact]
    public async Task NotificationSchema_FleetSettingsCapDefaults_Are500And1()
    {
        var ct = TestContext.Current.CancellationToken;

        await using var seedScope = fixture.Factory.Services.CreateAsyncScope();
        var seedDb = seedScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var fleet = await SeedFleetAsync(seedDb, ct);

        // Insert FleetSettings via raw SQL that omits the cap columns so the DB default applies.
        await seedDb.Database.ExecuteSqlRawAsync(
            "INSERT INTO fleet_settings (fleet_id, offer_timeout_seconds, auto_dispatch_enabled, auto_dispatch_after_seconds, max_offer_radius_km) " +
            "VALUES ({0}, 45, false, 60, 15)",
            [fleet.Id], ct);

        var settings = await seedDb.FleetSettings.IgnoreQueryFilters().AsNoTracking()
            .FirstAsync(s => s.FleetId == fleet.Id, ct);

        settings.SmsMonthlyCapCzk.Should().Be(500);
        settings.SmsUnitCostCzk.Should().Be(1);
    }
}

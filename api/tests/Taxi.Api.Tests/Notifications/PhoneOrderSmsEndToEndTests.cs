using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Infrastructure.Jobs;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Notifications;

/// <summary>AC#1 end-to-end: a Phone-source order enqueues exactly ONE SMS with a working absolute
/// tracking link; after one dispatch tick the SMS is produced and a single Sent log row exists.</summary>
[Collection(TestCollections.Database)]
public sealed class PhoneOrderSmsEndToEndTests(PostgresFixture fixture)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() }
    };

    private static async Task<(Fleet fleet, Guid dispatcherUserId)> SeedFleetAsync(TaxiDbContext db, CancellationToken ct)
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var fleet = new Fleet
        {
            Id = Guid.CreateVersion7(),
            Slug = $"e2e-{suffix}",
            Name = "E2E Taxi",
            Phone = "+420600500001",
            Currency = "CZK",
            TimeZone = "Europe/Prague",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        };
        var dispatcher = new User
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            Role = UserRole.Dispatcher,
            Phone = $"+420608{suffix}0",
            DisplayName = "E2E Dispatcher",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        };
        db.Fleets.Add(fleet);
        db.Users.Add(dispatcher);
        await db.SaveChangesAsync(ct);
        return (fleet, dispatcher.Id);
    }

    [Fact]
    public async Task PhoneOrderSmsEndToEnd_EnqueuesOneSmsWithTrackingLink_AndSends()
    {
        var ct = TestContext.Current.CancellationToken;
        using var factory = new NotificationTestFactory(fixture.ConnectionString);

        Guid fleetId;
        Guid dispatcherId;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
            (var fleet, dispatcherId) = await SeedFleetAsync(db, ct);
            fleetId = fleet.Id;
        }

        // Dispatcher creates a Phone-source order.
        var client = factory.CreateClient().AsDispatcher(fleetId, dispatcherId);
        var createResp = await client.PostAsJsonAsync("/api/v1/orders", new
        {
            pickupAddress = "Namesti Miru 1",
            pickupLat = 50.075,
            pickupLng = 14.44,
            customerPhone = "+420777123456",
            priceType = "Estimate",
            estimatedPriceCzk = 250,
            passengers = 1,
            source = "Phone"
        }, JsonOptions, ct);
        createResp.StatusCode.Should().Be(HttpStatusCode.Created);

        // Exactly one SMS outbox row is queued (OrderCreatedForCustomer), no dispatch push for phone.
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
            var outbox = await db.NotificationOutbox.IgnoreQueryFilters().AsNoTracking()
                .Where(o => o.FleetId == fleetId).ToListAsync(ct);
            outbox.Should().ContainSingle()
                .Which.Channel.Should().Be(NotificationChannel.Sms);
        }

        // Run one dispatch tick → the SMS is produced with a working absolute tracking link.
        var job = new NotificationDispatchJob(
            factory.Services.GetRequiredService<IServiceScopeFactory>(),
            factory.FakeTime,
            NullLogger<NotificationDispatchJob>.Instance);
        await job.RunTickAsync(ct);

        factory.Sms.Sent.Should().ContainSingle("exactly one SMS is produced");
        factory.Sms.Sent.TryPeek(out var sms).Should().BeTrue();
        sms!.Body.Should().Contain("https://", "the SMS carries an absolute tracking link");
        sms.Body.Should().Contain("/c/t/");
        Taxi.Api.Common.Notifications.GsmSevenValidator.IsGsm7AndWithinLimit(sms.Body).Should().BeTrue(
            $"the real end-to-end SMS (real minted token) must fit one GSM-7 segment; was {sms.Body.Length}: {sms.Body}");

        // Exactly one Sent log row.
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
            var logs = await db.NotificationLog.IgnoreQueryFilters().AsNoTracking()
                .Where(l => l.FleetId == fleetId).ToListAsync(ct);
            logs.Should().ContainSingle()
                .Which.Status.Should().Be(NotificationStatus.Sent);
        }
    }
}

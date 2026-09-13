using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Common.Ops;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Infra;

/// <summary>Tests for <see cref="FiveHundredRateAlerter"/> — the 5xx-per-minute window decision logic
/// and the ops-fleet FleetAdmin push path. Drives the alerter directly (resolved from a dedicated factory
/// whose FakeTime is advanced and whose IPushSender is a recording double); does not provoke real 500s.</summary>
[Collection(TestCollections.Database)]
public sealed class FiveHundredAlerterTests(PostgresFixture fixture)
{
    [Fact]
    public async Task FiveHundredAlerter_ElevenIn60s_FiresExactlyOneAlert()
    {
        var ct = TestContext.Current.CancellationToken;
        var slug = $"ops-{Guid.NewGuid():N}";
        await using var factory = new FiveHundredTestFactory(fixture.ConnectionString, slug);
        await SeedOpsFleetAsync(factory, slug, admins: 1, subscriptionsPerAdmin: 1, ct);
        var alerter = factory.Services.GetRequiredService<FiveHundredRateAlerter>();

        for (var i = 0; i < 11; i++)
            await alerter.RecordServerErrorAsync(ct);

        factory.Push.SendCount.Should().Be(1);
    }

    [Fact]
    public async Task FiveHundredAlerter_TenOrFewer_FiresNothing()
    {
        var ct = TestContext.Current.CancellationToken;
        var slug = $"ops-{Guid.NewGuid():N}";
        await using var factory = new FiveHundredTestFactory(fixture.ConnectionString, slug);
        await SeedOpsFleetAsync(factory, slug, admins: 1, subscriptionsPerAdmin: 1, ct);
        var alerter = factory.Services.GetRequiredService<FiveHundredRateAlerter>();

        for (var i = 0; i < 10; i++)
            await alerter.RecordServerErrorAsync(ct);

        factory.Push.SendCount.Should().Be(0);
    }

    [Fact]
    public async Task FiveHundredAlerter_NextWindow_ResetsAndCanFireAgain()
    {
        var ct = TestContext.Current.CancellationToken;
        var slug = $"ops-{Guid.NewGuid():N}";
        await using var factory = new FiveHundredTestFactory(fixture.ConnectionString, slug);
        await SeedOpsFleetAsync(factory, slug, admins: 1, subscriptionsPerAdmin: 1, ct);
        var alerter = factory.Services.GetRequiredService<FiveHundredRateAlerter>();

        for (var i = 0; i < 11; i++)
            await alerter.RecordServerErrorAsync(ct);
        factory.Push.SendCount.Should().Be(1);

        // Advance past the current minute window.
        factory.FakeTime.Advance(TimeSpan.FromMinutes(1));

        for (var i = 0; i < 11; i++)
            await alerter.RecordServerErrorAsync(ct);
        factory.Push.SendCount.Should().Be(2);
    }

    [Fact]
    public async Task FiveHundredAlerter_OnlyOnePushPerWindow_EvenWithManyErrors()
    {
        var ct = TestContext.Current.CancellationToken;
        var slug = $"ops-{Guid.NewGuid():N}";
        await using var factory = new FiveHundredTestFactory(fixture.ConnectionString, slug);
        await SeedOpsFleetAsync(factory, slug, admins: 1, subscriptionsPerAdmin: 1, ct);
        var alerter = factory.Services.GetRequiredService<FiveHundredRateAlerter>();

        for (var i = 0; i < 50; i++)
            await alerter.RecordServerErrorAsync(ct);

        factory.Push.SendCount.Should().Be(1);
    }

    [Fact]
    public async Task FiveHundredAlerter_SendsPushToEveryOpsFleetAdminSubscription()
    {
        var ct = TestContext.Current.CancellationToken;
        var slug = $"ops-{Guid.NewGuid():N}";
        await using var factory = new FiveHundredTestFactory(fixture.ConnectionString, slug);
        // 2 admins × 2 subscriptions each = 4 pushes for a single fired window.
        await SeedOpsFleetAsync(factory, slug, admins: 2, subscriptionsPerAdmin: 2, ct);
        var alerter = factory.Services.GetRequiredService<FiveHundredRateAlerter>();

        for (var i = 0; i < 11; i++)
            await alerter.RecordServerErrorAsync(ct);

        factory.Push.SendCount.Should().Be(4);
    }

    [Fact]
    public async Task FiveHundredAlerter_NoOpsFleet_LogsWarningAndNoOps()
    {
        var ct = TestContext.Current.CancellationToken;
        // Point at a slug that does not exist — no ops fleet seeded.
        var slug = $"nonexistent-{Guid.NewGuid():N}";
        await using var factory = new FiveHundredTestFactory(fixture.ConnectionString, slug);
        var alerter = factory.Services.GetRequiredService<FiveHundredRateAlerter>();

        var act = async () =>
        {
            for (var i = 0; i < 11; i++)
                await alerter.RecordServerErrorAsync(ct);
        };

        await act.Should().NotThrowAsync();
        factory.Push.SendCount.Should().Be(0);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static async Task SeedOpsFleetAsync(
        FiveHundredTestFactory factory, string slug, int admins, int subscriptionsPerAdmin, CancellationToken ct)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var now = new DateTimeOffset(2026, 9, 13, 12, 0, 0, TimeSpan.Zero);

        var fleetId = Guid.CreateVersion7();
        db.Fleets.Add(new Fleet
        {
            Id = fleetId,
            Slug = slug,
            Name = "Ops",
            Phone = "+420000000000",
            IsActive = true,
            CreatedAt = now
        });

        for (var a = 0; a < admins; a++)
        {
            var userId = Guid.CreateVersion7();
            db.Users.Add(new User
            {
                Id = userId,
                FleetId = fleetId,
                Role = UserRole.FleetAdmin,
                Email = $"admin-{a}-{slug}@ops.local",
                Phone = $"+42000000{a:D4}",
                DisplayName = $"Ops Admin {a}",
                IsActive = true,
                CreatedAt = now
            });

            for (var s = 0; s < subscriptionsPerAdmin; s++)
            {
                db.PushSubscriptions.Add(new PushSubscription
                {
                    Id = Guid.CreateVersion7(),
                    FleetId = fleetId,
                    UserId = userId,
                    Endpoint = $"https://push.example/{Guid.NewGuid():N}",
                    P256dh = "p256dh",
                    Auth = "auth",
                    CreatedAt = now
                });
            }
        }

        await db.SaveChangesAsync(ct);
    }
}

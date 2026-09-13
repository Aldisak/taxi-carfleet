using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Time.Testing;
using Taxi.Api.Common.Gdpr;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Infrastructure.Jobs;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Reports;

/// <summary>Integration tests for the RetentionJob + shared CustomerAnonymizer (UC-007 A7, AC#5).
/// The job is constructed directly with a locally-pinned FakeTimeProvider and the shared fixture's
/// scope factory so the 24-month cutoff is controlled without advancing shared DI time.</summary>
[Collection(TestCollections.Database)]
public sealed class RetentionJobTests(PostgresFixture fixture)
{
    private static readonly DateTimeOffset Now = new(2026, 9, 13, 12, 0, 0, TimeSpan.Zero);

    private RetentionJob BuildJob() => new(
        fixture.Factory.Services.GetRequiredService<IServiceScopeFactory>(),
        new FakeTimeProvider(Now),
        NullLogger<RetentionJob>.Instance);

    /// <summary>AC#5: a 25-month-old order is anonymized (sentinel phone/name, null customer, row kept).</summary>
    [Fact]
    public async Task RetentionJob_AnonymizesOrderOlderThan24Months()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleetId = await SeedFleetAsync(ct);
        var customerId = await SeedCustomerAsync(ct);
        var orderId = await SeedOrderAsync(fleetId, customerId, Now.AddMonths(-25), ct);

        await BuildJob().RunTickAsync(ct);

        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var order = await db.Orders.IgnoreQueryFilters().AsNoTracking().FirstAsync(o => o.Id == orderId, ct);

        order.Should().NotBeNull("the order row is kept, only anonymized");
        order.CustomerUserId.Should().BeNull();
        order.CustomerPhone.Should().Be(CustomerAnonymizer.SentinelPhone);
        order.CustomerName.Should().Be(CustomerAnonymizer.SentinelName);
    }

    /// <summary>A 23-month-old order is left intact.</summary>
    [Fact]
    public async Task RetentionJob_LeavesOrderUnder24Months()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleetId = await SeedFleetAsync(ct);
        var customerId = await SeedCustomerAsync(ct);
        var orderId = await SeedOrderAsync(fleetId, customerId, Now.AddMonths(-23), ct, phone: "+420777200023");

        await BuildJob().RunTickAsync(ct);

        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var order = await db.Orders.IgnoreQueryFilters().AsNoTracking().FirstAsync(o => o.Id == orderId, ct);

        order.CustomerPhone.Should().Be("+420777200023");
        order.CustomerUserId.Should().Be(customerId);
    }

    /// <summary>SMS codes expired more than 1 day ago are deleted; fresh ones are kept.</summary>
    [Fact]
    public async Task RetentionJob_DeletesExpiredSmsCodes()
    {
        var ct = TestContext.Current.CancellationToken;
        var oldId = await SeedSmsCodeAsync("+420777201001", Now.AddDays(-2), ct);
        var freshId = await SeedSmsCodeAsync("+420777201002", Now.AddMinutes(5), ct);

        await BuildJob().RunTickAsync(ct);

        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        (await db.SmsCodes.AnyAsync(c => c.Id == oldId, ct)).Should().BeFalse();
        (await db.SmsCodes.AnyAsync(c => c.Id == freshId, ct)).Should().BeTrue();
    }

    /// <summary>Refresh tokens expired more than 30 days ago are deleted; recent ones are kept.</summary>
    [Fact]
    public async Task RetentionJob_DeletesOldRefreshTokens()
    {
        var ct = TestContext.Current.CancellationToken;
        var userId = await SeedCustomerAsync(ct);
        var oldId = await SeedRefreshTokenAsync(userId, Now.AddDays(-31), ct);
        var recentId = await SeedRefreshTokenAsync(userId, Now.AddDays(-10), ct);

        await BuildJob().RunTickAsync(ct);

        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        (await db.RefreshTokens.AnyAsync(t => t.Id == oldId, ct)).Should().BeFalse();
        (await db.RefreshTokens.AnyAsync(t => t.Id == recentId, ct)).Should().BeTrue();
    }

    /// <summary>Anonymization runs per-fleet in the correct tenant scope (no cross-fleet bleed).</summary>
    [Fact]
    public async Task RetentionJob_IsTenantScopedPerFleet()
    {
        var ct = TestContext.Current.CancellationToken;
        var fleetA = await SeedFleetAsync(ct);
        var fleetB = await SeedFleetAsync(ct);
        var custA = await SeedCustomerAsync(ct);
        var custB = await SeedCustomerAsync(ct);
        var orderA = await SeedOrderAsync(fleetA, custA, Now.AddMonths(-25), ct, phone: "+420777202001");
        var orderB = await SeedOrderAsync(fleetB, custB, Now.AddMonths(-25), ct, phone: "+420777202002");

        await BuildJob().RunTickAsync(ct);

        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var a = await db.Orders.IgnoreQueryFilters().AsNoTracking().FirstAsync(o => o.Id == orderA, ct);
        var b = await db.Orders.IgnoreQueryFilters().AsNoTracking().FirstAsync(o => o.Id == orderB, ct);

        a.CustomerPhone.Should().Be(CustomerAnonymizer.SentinelPhone);
        b.CustomerPhone.Should().Be(CustomerAnonymizer.SentinelPhone);
        a.FleetId.Should().Be(fleetA);
        b.FleetId.Should().Be(fleetB);
    }

    /// <summary>The shared anonymizer sets the sentinel fields and keeps the order row.</summary>
    [Fact]
    public void CustomerAnonymizer_SetsSentinelPhoneAndName_KeepsOrderRow()
    {
        var order = new Order
        {
            Id = Guid.CreateVersion7(),
            FleetId = Guid.CreateVersion7(),
            PublicCode = "ANON01",
            Status = OrderStatus.Completed,
            Source = OrderSource.App,
            CustomerUserId = Guid.CreateVersion7(),
            CustomerPhone = "+420777999000",
            CustomerName = "Real Name",
            PickupAddress = "Pickup",
            PickupLat = 50,
            PickupLng = 15,
            Passengers = 1,
            PriceType = PriceType.Estimate,
            CreatedAt = Now,
            UpdatedAt = Now,
            Version = 1
        };

        CustomerAnonymizer.Anonymize(order);

        order.CustomerUserId.Should().BeNull();
        order.CustomerPhone.Should().Be("+420000000000");
        order.CustomerName.Should().Be("Anonymizováno");
        order.PublicCode.Should().Be("ANON01", "the order row is preserved");
    }

    // ── Seeding helpers ──────────────────────────────────────────────────────────

    private async Task<Guid> SeedFleetAsync(CancellationToken ct)
    {
        var fleetId = Guid.CreateVersion7();
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.Fleets.Add(new Fleet
        {
            Id = fleetId,
            Slug = $"ret-{Guid.NewGuid():N}".Substring(0, 20),
            Name = "Retention Fleet",
            Phone = "+420777200001",
            Currency = "CZK",
            TimeZone = "Europe/Prague",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync(ct);
        return fleetId;
    }

    private async Task<Guid> SeedCustomerAsync(CancellationToken ct)
    {
        var userId = Guid.CreateVersion7();
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.Users.Add(new User
        {
            Id = userId,
            FleetId = null,
            Role = UserRole.Customer,
            Phone = $"+4207776{Random.Shared.Next(100000, 999999)}",
            DisplayName = "Retention Customer",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync(ct);
        return userId;
    }

    private async Task<Guid> SeedOrderAsync(
        Guid fleetId, Guid customerId, DateTimeOffset createdAt, CancellationToken ct, string phone = "+420777200900")
    {
        var orderId = Guid.CreateVersion7();
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.Orders.Add(new Order
        {
            Id = orderId,
            FleetId = fleetId,
            PublicCode = new string(Enumerable.Range(0, 6).Select(_ => "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[Random.Shared.Next(36)]).ToArray()),
            Status = OrderStatus.Completed,
            Source = OrderSource.App,
            CustomerUserId = customerId,
            CustomerPhone = phone,
            CustomerName = "Real Customer",
            PickupAddress = "Pickup",
            PickupLat = 50.0,
            PickupLng = 15.2,
            Passengers = 1,
            PriceType = PriceType.Estimate,
            FinalPriceCzk = 200,
            PaymentType = PaymentType.Cash,
            CreatedAt = createdAt,
            CompletedAt = createdAt.AddMinutes(25),
            UpdatedAt = createdAt,
            Version = 1
        });
        await db.SaveChangesAsync(ct);
        return orderId;
    }

    private async Task<Guid> SeedSmsCodeAsync(string phone, DateTimeOffset expiresAt, CancellationToken ct)
    {
        var id = Guid.CreateVersion7();
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.SmsCodes.Add(new SmsCode
        {
            Id = id,
            Phone = phone,
            CodeHash = "deadbeef",
            ExpiresAt = expiresAt,
            Attempts = 0
        });
        await db.SaveChangesAsync(ct);
        return id;
    }

    private async Task<Guid> SeedRefreshTokenAsync(Guid userId, DateTimeOffset expiresAt, CancellationToken ct)
    {
        var id = Guid.CreateVersion7();
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.RefreshTokens.Add(new RefreshToken
        {
            Id = id,
            UserId = userId,
            TokenHash = Guid.NewGuid().ToString("N"),
            ExpiresAt = expiresAt,
            CreatedAt = expiresAt.AddDays(-30)
        });
        await db.SaveChangesAsync(ct);
        return id;
    }
}

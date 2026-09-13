using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Common.Gdpr;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Reports;

/// <summary>Integration tests for DELETE /customers/me (UC-007 A8, AC#6): SMS-confirmed GDPR
/// self-deletion that anonymizes the caller's orders (kept for reports) and deletes the user.</summary>
[Collection(TestCollections.Database)]
public sealed class DeleteMeTests(PostgresFixture fixture)
{
    /// <summary>A valid SMS code anonymizes the caller's orders and deletes the user.</summary>
    [Fact]
    public async Task DeleteMe_ValidSmsCode_AnonymizesOrdersAndDeletesUser()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, customerId, phone) = await SeedCustomerWithOrderAsync(ct);
        await SeedSmsCodeAsync(phone, "123456", ct);
        var tokenId = await SeedRefreshTokenAsync(customerId, ct);
        var pushId = await SeedPushSubscriptionAsync(customerId, ct);

        var client = fixture.Factory.CreateClient().AsCustomer(customerId);
        var resp = await client.SendAsync(DeleteRequest("123456"), ct);
        resp.StatusCode.Should().Be(HttpStatusCode.NoContent);

        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        (await db.Users.IgnoreQueryFilters().AnyAsync(u => u.Id == customerId, ct)).Should().BeFalse();

        // The user's refresh tokens and push subscriptions are deleted (GDPR erasure).
        (await db.RefreshTokens.AnyAsync(t => t.Id == tokenId, ct)).Should().BeFalse();
        (await db.PushSubscriptions.IgnoreQueryFilters().AnyAsync(p => p.Id == pushId, ct)).Should().BeFalse();

        var orders = await db.Orders.IgnoreQueryFilters().AsNoTracking()
            .Where(o => o.FleetId == fleetId).ToListAsync(ct);
        orders.Should().NotBeEmpty();
        orders.Should().OnlyContain(o =>
            o.CustomerUserId == null
            && o.CustomerPhone == CustomerAnonymizer.SentinelPhone
            && o.CustomerName == CustomerAnonymizer.SentinelName);
    }

    /// <summary>AC#6: the customer's past orders remain in the fleet report after deletion, anonymized.</summary>
    [Fact]
    public async Task DeleteMe_OrdersRemainInReportsAnonymized()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, customerId, phone) = await SeedCustomerWithOrderAsync(ct, completedPriceCzk: 275);
        var adminId = await SeedFleetAdminAsync(fleetId, ct);
        await SeedSmsCodeAsync(phone, "654321", ct);

        var customer = fixture.Factory.CreateClient().AsCustomer(customerId);
        (await customer.SendAsync(DeleteRequest("654321"), ct)).EnsureSuccessStatusCode();

        // The fleet report still counts the anonymized completed order.
        var admin = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminId);
        var report = await admin.GetFromJsonAsync<FleetReportDto>(
            "/api/v1/reports/fleet?from=2026-03-01&to=2026-03-31", ct);

        report!.Kpis.Rides.Should().Be(1);
        report.Kpis.RevenueCzk.Should().Be(275);
    }

    /// <summary>A wrong code → 400.</summary>
    [Fact]
    public async Task DeleteMe_WrongCode_Returns400()
    {
        var ct = TestContext.Current.CancellationToken;
        var (_, customerId, phone) = await SeedCustomerWithOrderAsync(ct);
        await SeedSmsCodeAsync(phone, "111111", ct);

        var client = fixture.Factory.CreateClient().AsCustomer(customerId);
        var resp = await client.SendAsync(DeleteRequest("999999"), ct);
        resp.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    /// <summary>An anonymous request → 401.</summary>
    [Fact]
    public async Task DeleteMe_Anonymous_Returns401()
    {
        var ct = TestContext.Current.CancellationToken;
        var client = fixture.Factory.CreateClient();
        var resp = await client.SendAsync(DeleteRequest("123456"), ct);
        resp.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    /// <summary>A caller with no customer user row → 404.</summary>
    [Fact]
    public async Task DeleteMe_NoCustomerUser_Returns404()
    {
        var ct = TestContext.Current.CancellationToken;
        var client = fixture.Factory.CreateClient().AsCustomer(Guid.CreateVersion7());
        var resp = await client.SendAsync(DeleteRequest("123456"), ct);
        resp.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────────

    private static HttpRequestMessage DeleteRequest(string code) =>
        new(HttpMethod.Delete, "/api/v1/customers/me")
        {
            Content = JsonContent.Create(new { code })
        };

    private async Task<(Guid fleetId, Guid customerId, string phone)> SeedCustomerWithOrderAsync(
        CancellationToken ct, int completedPriceCzk = 200)
    {
        var fleetId = Guid.CreateVersion7();
        var customerId = Guid.CreateVersion7();
        var phone = $"+4207778{Random.Shared.Next(100000, 999999)}";

        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.Fleets.Add(new Fleet
        {
            Id = fleetId,
            Slug = $"del-{Guid.NewGuid():N}".Substring(0, 20),
            Name = "Delete Me Fleet",
            Phone = "+420777011001",
            Currency = "CZK",
            TimeZone = "Europe/Prague",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        });
        db.FleetSettings.Add(new FleetSettings { FleetId = fleetId, SmsUnitCostCzk = 1 });
        db.Users.Add(new User
        {
            Id = customerId,
            FleetId = null,
            Role = UserRole.Customer,
            Phone = phone,
            DisplayName = phone,
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        });
        db.Orders.Add(new Order
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleetId,
            PublicCode = new string(Enumerable.Range(0, 6).Select(_ => "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[Random.Shared.Next(36)]).ToArray()),
            Status = OrderStatus.Completed,
            Source = OrderSource.App,
            CustomerUserId = customerId,
            CustomerPhone = phone,
            CustomerName = "Real Name",
            PickupAddress = "Pickup",
            PickupLat = 50.0,
            PickupLng = 15.2,
            Passengers = 1,
            PriceType = PriceType.Estimate,
            FinalPriceCzk = completedPriceCzk,
            PaymentType = PaymentType.Cash,
            CreatedAt = new DateTimeOffset(2026, 3, 16, 13, 0, 0, TimeSpan.Zero),
            CompletedAt = new DateTimeOffset(2026, 3, 16, 13, 25, 0, TimeSpan.Zero),
            UpdatedAt = new DateTimeOffset(2026, 3, 16, 13, 0, 0, TimeSpan.Zero),
            Version = 1
        });
        await db.SaveChangesAsync(ct);
        return (fleetId, customerId, phone);
    }

    private async Task<Guid> SeedFleetAdminAsync(Guid fleetId, CancellationToken ct)
    {
        var adminId = Guid.CreateVersion7();
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.Users.Add(new User
        {
            Id = adminId,
            FleetId = fleetId,
            Role = UserRole.FleetAdmin,
            Email = $"admin-{adminId:N}@del.local",
            Phone = $"+4207779{Random.Shared.Next(100000, 999999)}",
            DisplayName = "Delete Admin",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync(ct);
        return adminId;
    }

    private async Task<Guid> SeedRefreshTokenAsync(Guid userId, CancellationToken ct)
    {
        var id = Guid.CreateVersion7();
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.RefreshTokens.Add(new RefreshToken
        {
            Id = id,
            UserId = userId,
            TokenHash = Guid.NewGuid().ToString("N"),
            ExpiresAt = new DateTimeOffset(2030, 1, 1, 0, 0, 0, TimeSpan.Zero),
            CreatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync(ct);
        return id;
    }

    private async Task<Guid> SeedPushSubscriptionAsync(Guid userId, CancellationToken ct)
    {
        var id = Guid.CreateVersion7();
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.PushSubscriptions.Add(new PushSubscription
        {
            Id = id,
            FleetId = null,
            UserId = userId,
            Endpoint = $"https://push.example/{id:N}",
            P256dh = "key",
            Auth = "auth",
            CreatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync(ct);
        return id;
    }

    private async Task SeedSmsCodeAsync(string phone, string code, CancellationToken ct)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        // FakeTimeProvider pins 'now' to 2026-09-10 12:00Z; expire well after.
        db.SmsCodes.Add(new SmsCode
        {
            Id = Guid.CreateVersion7(),
            Phone = phone,
            CodeHash = ComputeCodeHash(code),
            ExpiresAt = new DateTimeOffset(2030, 1, 1, 0, 0, 0, TimeSpan.Zero),
            Attempts = 0
        });
        await db.SaveChangesAsync(ct);
    }

    private static string ComputeCodeHash(string rawCode)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(rawCode));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    private sealed record FleetReportDto(FleetKpiDto Kpis);

    private sealed record FleetKpiDto(int Rides, int RevenueCzk);
}

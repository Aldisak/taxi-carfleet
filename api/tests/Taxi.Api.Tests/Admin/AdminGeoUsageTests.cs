using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Admin;

/// <summary>Integration tests for GET /api/v1/admin/geo-usage (WI-14, SuperAdminOnly, cross-tenant).</summary>
[Collection(TestCollections.Database)]
public sealed class AdminGeoUsageTests(PostgresFixture fixture)
{
    // FakeTimeProvider is pinned to 2026-09-10 12:00 UTC → Prague is 14:00, month = September 2026.
    // Current Prague month = Sep 2026 → DateOnly(2026, 9, d) rows are "this month".

    // ── Happy path: SuperAdmin sees both fleets' rows ─────────────────────────

    /// <summary>SuperAdmin gets cross-tenant per-fleet geo usage with both seeded fleets visible.</summary>
    [Fact]
    public async Task HandleAsync_SuperAdmin_ReturnsPerFleetGeoUsage()
    {
        var ct = TestContext.Current.CancellationToken;

        // Seed fleet A: 100 credits this month via two suggest calls
        var (fleetA, _) = await SeedFleetAsync("geo-usage-A", ct);
        await SeedGeoUsageAsync(fleetA, new DateOnly(2026, 9, 5), GeoCacheKind.Suggest, calls: 10, credits: 40, ct);
        await SeedGeoUsageAsync(fleetA, new DateOnly(2026, 9, 9), GeoCacheKind.Route, calls: 15, credits: 60, ct);
        // FleetSettings with budget = 500
        await SeedFleetSettingsAsync(fleetA, geoMonthlyCreditBudget: 500, ct);

        // Seed fleet B: 200 credits this month via geocode
        var (fleetB, _) = await SeedFleetAsync("geo-usage-B", ct);
        await SeedGeoUsageAsync(fleetB, new DateOnly(2026, 9, 3), GeoCacheKind.Geocode, calls: 25, credits: 200, ct);
        // FleetSettings default budget = 250_000

        var client = fixture.Factory.CreateClient().AsSuperAdmin();
        var resp = await client.GetAsync("/api/v1/admin/geo-usage", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<GetAdminGeoUsageResponseDto>(ct);
        body.Should().NotBeNull();

        // Locate our two fleet rows (shared DB may have other fleets)
        var rowA = body!.Fleets.FirstOrDefault(f => f.FleetId == fleetA);
        var rowB = body!.Fleets.FirstOrDefault(f => f.FleetId == fleetB);

        rowA.Should().NotBeNull("fleet A must appear in cross-tenant response");
        rowB.Should().NotBeNull("fleet B must appear in cross-tenant response");

        // Fleet A: 100 credits total, budget = 500 → 20%
        rowA!.CreditsEstThisMonth.Should().Be(100, "fleet A has 40+60 = 100 credits this month");
        rowA.TotalCallsThisMonth.Should().Be(25, "fleet A has 10+15 = 25 calls this month");
        rowA.Budget.Should().Be(500, "fleet A budget was set to 500");
        rowA.PercentOfBudget.Should().BeApproximately(20.0, 0.01, "100/500 = 20%");

        // Fleet B: 200 credits, default budget = 250_000
        rowB!.CreditsEstThisMonth.Should().Be(200, "fleet B has 200 credits this month");
        rowB.TotalCallsThisMonth.Should().Be(25, "fleet B has 25 calls this month");
        rowB.Budget.Should().Be(250_000, "fleet B uses default budget 250 000");

        // Platform totals
        body.PlatformTotalCredits.Should().BeGreaterThanOrEqualTo(300,
            "platform total must include at least fleet A + B (100 + 200 = 300)");
        body.PlatformTotalCalls.Should().BeGreaterThanOrEqualTo(50,
            "platform total calls must include at least fleet A + B (25 + 25 = 50)");
    }

    // ── Fleet with no usage this month still appears ──────────────────────────

    /// <summary>A fleet that exists but has no geo_usage rows for the current month appears with zeros.</summary>
    [Fact]
    public async Task HandleAsync_FleetWithNoUsage_AppearsWithZeros()
    {
        var ct = TestContext.Current.CancellationToken;

        var (fleetId, _) = await SeedFleetAsync("geo-usage-zero", ct);
        // No geo_usage rows seeded. Budget defaults to 250 000.

        var client = fixture.Factory.CreateClient().AsSuperAdmin();
        var resp = await client.GetAsync("/api/v1/admin/geo-usage", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<GetAdminGeoUsageResponseDto>(ct);
        body.Should().NotBeNull();

        var row = body!.Fleets.FirstOrDefault(f => f.FleetId == fleetId);
        row.Should().NotBeNull("zero-usage fleet must still appear in the list");
        row!.CreditsEstThisMonth.Should().Be(0, "no usage rows → 0 credits");
        row.TotalCallsThisMonth.Should().Be(0, "no usage rows → 0 calls");
        row.PercentOfBudget.Should().Be(0.0, "0 credits → 0% of budget");
    }

    // ── Last month rows are excluded ───────────────────────────────────────────

    /// <summary>GeoUsage rows from last month must NOT be included in this month's totals.</summary>
    [Fact]
    public async Task HandleAsync_LastMonthRows_AreExcluded()
    {
        var ct = TestContext.Current.CancellationToken;

        var (fleetId, _) = await SeedFleetAsync("geo-usage-lastmonth", ct);
        // Row in August (last month relative to fake clock Sep 2026)
        await SeedGeoUsageAsync(fleetId, new DateOnly(2026, 8, 20), GeoCacheKind.Suggest, calls: 50, credits: 200, ct);
        // Row in current month (Sep)
        await SeedGeoUsageAsync(fleetId, new DateOnly(2026, 9, 1), GeoCacheKind.Route, calls: 5, credits: 20, ct);

        var client = fixture.Factory.CreateClient().AsSuperAdmin();
        var resp = await client.GetAsync("/api/v1/admin/geo-usage", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<GetAdminGeoUsageResponseDto>(ct);
        var row = body!.Fleets.FirstOrDefault(f => f.FleetId == fleetId);

        row.Should().NotBeNull();
        row!.CreditsEstThisMonth.Should().Be(20, "only the Sep row (20 credits) should be counted, not Aug (200)");
        row.TotalCallsThisMonth.Should().Be(5, "only the Sep row (5 calls) should be counted, not Aug (50)");
    }

    // ── 403 for non-SuperAdmin ─────────────────────────────────────────────────

    /// <summary>A FleetAdmin is forbidden from the SuperAdmin-only endpoint.</summary>
    [Fact]
    public async Task HandleAsync_NonSuperAdmin_Returns403()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, adminId) = await SeedFleetAsync("geo-usage-403", ct);

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminId);
        var resp = await client.GetAsync("/api/v1/admin/geo-usage", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    /// <summary>A Dispatcher is forbidden from the SuperAdmin-only endpoint.</summary>
    [Fact]
    public async Task HandleAsync_Dispatcher_Returns403()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, _) = await SeedFleetAsync("geo-usage-403-disp", ct);

        var client = fixture.Factory.CreateClient().AsDispatcher(fleetId);
        var resp = await client.GetAsync("/api/v1/admin/geo-usage", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private async Task<(Guid fleetId, Guid adminId)> SeedFleetAsync(string tag, CancellationToken ct)
    {
        var fleetId = Guid.CreateVersion7();
        var adminId = Guid.CreateVersion7();
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.Fleets.Add(new Fleet
        {
            Id = fleetId,
            Slug = $"geo-us-{Guid.NewGuid():N}",
            Name = $"GeoUsage {tag}",
            Phone = $"+42076{Guid.NewGuid().ToString("N")[..7]}",
            Currency = "CZK",
            TimeZone = "Europe/Prague",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        });
        db.Users.Add(new User
        {
            Id = adminId,
            FleetId = fleetId,
            Role = UserRole.FleetAdmin,
            Email = $"admin-{adminId:N}@geo-us.local",
            Phone = $"+42077{Guid.NewGuid().ToString("N")[..7]}",
            DisplayName = $"Admin {tag}",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync(ct);
        return (fleetId, adminId);
    }

    private async Task SeedGeoUsageAsync(
        Guid fleetId, DateOnly day, GeoCacheKind kind, int calls, int credits, CancellationToken ct)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.GeoUsage.Add(new GeoUsage
        {
            FleetId = fleetId,
            Day = day,
            Kind = kind,
            Calls = calls,
            CreditsEst = credits
        });
        await db.SaveChangesAsync(ct);
    }

    private async Task SeedFleetSettingsAsync(Guid fleetId, int geoMonthlyCreditBudget, CancellationToken ct)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.FleetSettings.Add(new FleetSettings
        {
            FleetId = fleetId,
            GeoMonthlyCreditBudget = geoMonthlyCreditBudget
        });
        await db.SaveChangesAsync(ct);
    }

    // ── Local response DTOs ───────────────────────────────────────────────────

    /// <summary>Local test DTO mirroring the API response shape for deserialization.</summary>
    private sealed record GetAdminGeoUsageResponseDto(
        List<FleetGeoUsageRowDto> Fleets,
        int PlatformTotalCredits,
        int PlatformTotalCalls);

    /// <summary>Local test DTO for a single fleet's geo usage row.</summary>
    private sealed record FleetGeoUsageRowDto(
        Guid FleetId,
        string FleetName,
        int TotalCallsThisMonth,
        int CreditsEstThisMonth,
        int Budget,
        double PercentOfBudget);
}

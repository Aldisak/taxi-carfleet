using System.Net;
using System.Net.Http.Json;
using System.Text;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Reports;

/// <summary>Integration tests for GET /reports/drivers (UC-007 A2): SQL per-Prague-day aggregation,
/// hand-computed table correctness, byte-exact UTF-8-BOM CSV export, tenant isolation, and authz.</summary>
[Collection(TestCollections.Database)]
public sealed class DriverReportTests(PostgresFixture fixture)
{
    // 2026-03-16 mid-day UTC (13:00Z = 14:00 Prague CET) — UTC and Prague land on the same calendar day.
    private static readonly DateTimeOffset Day1Noon = new(2026, 3, 16, 13, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset Day2Noon = new(2026, 3, 17, 13, 0, 0, TimeSpan.Zero);

    /// <summary>AC#1: the per-day rows and totals equal a hand-computed table for a known seed.</summary>
    [Fact]
    public async Task DriverReport_SeededData_MatchesHandComputedTable()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, driverId, adminUserId) = await SeedFleetWithDriverAsync(ct);
        await SeedHandComputedOrdersAsync(fleetId, driverId, ct);

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminUserId);
        var resp = await client.GetAsync(
            $"/api/v1/reports/drivers?driverId={driverId}&from=2026-03-16&to=2026-03-17", ct);
        resp.StatusCode.Should().Be(HttpStatusCode.OK);

        var report = await resp.Content.ReadFromJsonAsync<DriverReportResponseDto>(ct);
        report.Should().NotBeNull();
        report!.Days.Should().HaveCount(2);

        // Day 1 (2026-03-16): 2 completed (Cash 200, Card 300), 1 cancelled no-show, 1 price override.
        var d1 = report.Days.Single(d => d.Date == "2026-03-16");
        d1.RidesCompleted.Should().Be(2);
        d1.RidesCancelled.Should().Be(1);
        d1.CashCzk.Should().Be(200);
        d1.CardCzk.Should().Be(300);
        d1.InvoiceCzk.Should().Be(0);
        d1.TotalCzk.Should().Be(500);
        d1.PriceOverrideCount.Should().Be(1);

        // Day 2 (2026-03-17): 1 completed Invoice 150.
        var d2 = report.Days.Single(d => d.Date == "2026-03-17");
        d2.RidesCompleted.Should().Be(1);
        d2.RidesCancelled.Should().Be(0);
        d2.InvoiceCzk.Should().Be(150);
        d2.TotalCzk.Should().Be(150);

        // Totals.
        report.Totals.RidesCompleted.Should().Be(3);
        report.Totals.RidesCancelled.Should().Be(1);
        report.Totals.CashCzk.Should().Be(200);
        report.Totals.CardCzk.Should().Be(300);
        report.Totals.InvoiceCzk.Should().Be(150);
        report.Totals.TotalCzk.Should().Be(650);
        report.Totals.PriceOverrideCount.Should().Be(1);

        // Avg rating: one rated order at 4 stars → 4.0.
        report.AvgRating.Should().BeApproximately(4.0, 0.001);
    }

    /// <summary>Mid-day orders land on the same day under both UTC and Prague buckets.</summary>
    [Fact]
    public async Task DriverReport_PragueDayBucketing_MidDayOrdersStable()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, driverId, adminUserId) = await SeedFleetWithDriverAsync(ct);
        await SeedCompletedAsync(fleetId, driverId, Day1Noon, PaymentType.Cash, 200, ct);

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminUserId);
        var report = await client.GetFromJsonAsync<DriverReportResponseDto>(
            $"/api/v1/reports/drivers?driverId={driverId}&from=2026-03-16&to=2026-03-16", ct);

        report!.Days.Should().ContainSingle();
        report.Days[0].Date.Should().Be("2026-03-16");
    }

    /// <summary>AC#7: ?format=csv bytes begin with the UTF-8 BOM, use ';' and CRLF, and equal the fixture.</summary>
    [Fact]
    public async Task DriverReport_Csv_MatchesExpectedBytes()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, driverId, adminUserId) = await SeedFleetWithDriverAsync(ct);
        await SeedHandComputedOrdersAsync(fleetId, driverId, ct);

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminUserId);
        var resp = await client.GetAsync(
            $"/api/v1/reports/drivers?driverId={driverId}&from=2026-03-16&to=2026-03-17&format=csv", ct);
        resp.StatusCode.Should().Be(HttpStatusCode.OK);

        var bytes = await resp.Content.ReadAsByteArrayAsync(ct);

        // BOM.
        bytes.Take(3).Should().Equal(0xEF, 0xBB, 0xBF);
        // Separator + CRLF present.
        var text = Encoding.UTF8.GetString(bytes);
        text.Should().Contain(";");
        text.Should().Contain("\r\n");

        var expected = await File.ReadAllBytesAsync(ExpectedCsvPath(), ct);
        bytes.Should().Equal(expected);
    }

    /// <summary>Cross-fleet driverId → 404 (no leak).</summary>
    [Fact]
    public async Task DriverReport_CrossTenant_Returns404()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetA, _, adminA) = await SeedFleetWithDriverAsync(ct);
        var (_, driverB, _) = await SeedFleetWithDriverAsync(ct);

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetA, adminA);
        var resp = await client.GetAsync(
            $"/api/v1/reports/drivers?driverId={driverB}&from=2026-03-16&to=2026-03-16", ct);
        resp.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    /// <summary>A non-FleetAdmin (dispatcher) is forbidden.</summary>
    [Fact]
    public async Task DriverReport_NonFleetAdmin_Returns403()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, driverId, _) = await SeedFleetWithDriverAsync(ct);

        var client = fixture.Factory.CreateClient().AsDispatcher(fleetId);
        var resp = await client.GetAsync(
            $"/api/v1/reports/drivers?driverId={driverId}&from=2026-03-16&to=2026-03-16", ct);
        resp.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    /// <summary>to &lt; from → 400.</summary>
    [Fact]
    public async Task DriverReport_InvalidRange_Returns400()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, driverId, adminUserId) = await SeedFleetWithDriverAsync(ct);

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminUserId);
        var resp = await client.GetAsync(
            $"/api/v1/reports/drivers?driverId={driverId}&from=2026-03-17&to=2026-03-16", ct);
        resp.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    /// <summary>Hours-online clamps shift durations to the report window.</summary>
    [Fact]
    public async Task DriverReport_HoursOnline_ClampsToWindow()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, driverId, adminUserId) = await SeedFleetWithDriverAsync(ct);

        // Shift 10:00→13:00 Prague on 2026-03-16 = 3 hours, fully inside the day window.
        await SeedShiftAsync(fleetId, driverId,
            new DateTimeOffset(2026, 3, 16, 9, 0, 0, TimeSpan.Zero),   // 10:00 Prague
            new DateTimeOffset(2026, 3, 16, 12, 0, 0, TimeSpan.Zero),  // 13:00 Prague
            ct);

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminUserId);
        var report = await client.GetFromJsonAsync<DriverReportResponseDto>(
            $"/api/v1/reports/drivers?driverId={driverId}&from=2026-03-16&to=2026-03-16", ct);

        report!.Days[0].HoursOnline.Should().BeApproximately(3.0, 0.01);
    }

    /// <summary>Price-override count counts completed orders with a non-null override reason.</summary>
    [Fact]
    public async Task DriverReport_PriceOverrideCount()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, driverId, adminUserId) = await SeedFleetWithDriverAsync(ct);
        await SeedCompletedAsync(fleetId, driverId, Day1Noon, PaymentType.Cash, 250, ct, overrideReason: "Waiting time");

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminUserId);
        var report = await client.GetFromJsonAsync<DriverReportResponseDto>(
            $"/api/v1/reports/drivers?driverId={driverId}&from=2026-03-16&to=2026-03-16", ct);

        report!.Days[0].PriceOverrideCount.Should().Be(1);
    }

    // ── Seeding helpers ──────────────────────────────────────────────────────────

    private async Task<(Guid fleetId, Guid driverId, Guid adminUserId)> SeedFleetWithDriverAsync(CancellationToken ct)
    {
        var fleetId = Guid.CreateVersion7();
        var driverUserId = Guid.CreateVersion7();
        var driverId = Guid.CreateVersion7();
        var adminUserId = Guid.CreateVersion7();

        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        db.Fleets.Add(new Fleet
        {
            Id = fleetId,
            Slug = $"drv-report-{Guid.NewGuid():N}",
            Name = "Driver Report Fleet",
            Phone = "+420777006001",
            Currency = "CZK",
            TimeZone = "Europe/Prague",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        });
        db.Users.Add(new User
        {
            Id = driverUserId,
            FleetId = fleetId,
            Role = UserRole.Driver,
            Email = $"driver-{driverId:N}@report.local",
            Phone = $"+4207770{Random.Shared.Next(100000, 999999)}",
            DisplayName = "Report Driver",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        });
        db.Users.Add(new User
        {
            Id = adminUserId,
            FleetId = fleetId,
            Role = UserRole.FleetAdmin,
            Email = $"admin-{adminUserId:N}@report.local",
            Phone = $"+4207770{Random.Shared.Next(100000, 999999)}",
            DisplayName = "Report Admin",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        });
        db.Drivers.Add(new Driver
        {
            Id = driverId,
            FleetId = fleetId,
            UserId = driverUserId,
            Status = DriverStatus.Offline,
            IsActive = true
        });
        await db.SaveChangesAsync(ct);
        return (fleetId, driverId, adminUserId);
    }

    private async Task SeedHandComputedOrdersAsync(Guid fleetId, Guid driverId, CancellationToken ct)
    {
        // Day 1: 2 completed (Cash 200, Card 300 with override), 1 cancelled no-show.
        await SeedCompletedAsync(fleetId, driverId, Day1Noon, PaymentType.Cash, 200, ct, ratingStars: 4);
        await SeedCompletedAsync(fleetId, driverId, Day1Noon.AddMinutes(10), PaymentType.Card, 300, ct,
            overrideReason: "Extra stop");
        await SeedCancelledNoShowAsync(fleetId, driverId, Day1Noon.AddMinutes(20), ct);
        // Day 2: 1 completed Invoice 150.
        await SeedCompletedAsync(fleetId, driverId, Day2Noon, PaymentType.Invoice, 150, ct);
    }

    private async Task SeedCompletedAsync(
        Guid fleetId, Guid driverId, DateTimeOffset at, PaymentType payment, int priceCzk,
        CancellationToken ct, string? overrideReason = null, int? ratingStars = null)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.Orders.Add(new Order
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleetId,
            PublicCode = RandomCode(),
            Status = OrderStatus.Completed,
            Source = OrderSource.Dispatcher,
            CustomerPhone = "+420777100900",
            PickupAddress = "Pickup",
            PickupLat = 50.0,
            PickupLng = 15.2,
            Passengers = 1,
            PriceType = PriceType.Estimate,
            DriverId = driverId,
            FinalPriceCzk = priceCzk,
            PaymentType = payment,
            PriceOverrideReason = overrideReason,
            RatingStars = ratingStars,
            RatedAt = ratingStars is null ? null : at,
            CreatedAt = at,
            CompletedAt = at.AddMinutes(30),
            UpdatedAt = at,
            Version = 1
        });
        await db.SaveChangesAsync(ct);
    }

    private async Task SeedCancelledNoShowAsync(Guid fleetId, Guid driverId, DateTimeOffset at, CancellationToken ct)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.Orders.Add(new Order
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleetId,
            PublicCode = RandomCode(),
            Status = OrderStatus.Cancelled,
            Source = OrderSource.Dispatcher,
            CustomerPhone = "+420777100901",
            PickupAddress = "Pickup",
            PickupLat = 50.0,
            PickupLng = 15.2,
            Passengers = 1,
            PriceType = PriceType.Estimate,
            DriverId = driverId,
            CancelledByRole = UserRole.Driver,
            CancelReason = "no-show",
            CancelledAt = at.AddMinutes(5),
            CreatedAt = at,
            UpdatedAt = at,
            Version = 1
        });
        await db.SaveChangesAsync(ct);
    }

    private async Task SeedShiftAsync(Guid fleetId, Guid driverId, DateTimeOffset start, DateTimeOffset end, CancellationToken ct)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var tenant = scope.ServiceProvider.GetRequiredService<CurrentTenant>();
        tenant.FleetId = fleetId;

        var vehicleId = Guid.CreateVersion7();
        db.Vehicles.Add(new Vehicle
        {
            Id = vehicleId,
            FleetId = fleetId,
            Plate = $"SH{Random.Shared.Next(1000, 9999)}",
            Make = "Škoda",
            Model = "Octavia",
            Color = "Černá",
            Seats = 4,
            IsActive = true
        });
        db.DriverShifts.Add(new DriverShift
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleetId,
            DriverId = driverId,
            VehicleId = vehicleId,
            StartedAt = start,
            EndedAt = end
        });
        await db.SaveChangesAsync(ct);
    }

    private static string RandomCode() =>
        new(Enumerable.Range(0, 6).Select(_ => "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[Random.Shared.Next(36)]).ToArray());

    private static string ExpectedCsvPath()
    {
        var dir = Path.GetDirectoryName(typeof(DriverReportTests).Assembly.Location)!;
        return Path.Combine(dir, "Reports", "DriverReportExpected.csv");
    }

    // ── Response DTOs (mirror the API JSON contract) ─────────────────────────────

    private sealed record DriverReportResponseDto(
        Guid DriverId, string DriverName, double? AvgRating,
        List<DriverReportDay> Days, DriverReportTotals Totals);

    private sealed record DriverReportDay(
        string Date, int RidesCompleted, int RidesCancelled,
        int CashCzk, int CardCzk, int InvoiceCzk, int TotalCzk,
        double HoursOnline, int PriceOverrideCount);

    private sealed record DriverReportTotals(
        int RidesCompleted, int RidesCancelled,
        int CashCzk, int CardCzk, int InvoiceCzk, int TotalCzk,
        double HoursOnline, int PriceOverrideCount);
}

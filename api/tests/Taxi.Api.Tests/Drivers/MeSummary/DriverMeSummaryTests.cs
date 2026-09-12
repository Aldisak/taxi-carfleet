using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using FluentValidation.TestHelper;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Common;
using Taxi.Api.Features.Drivers.GetMe;
using Taxi.Api.Features.Drivers.GetMySummary;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Drivers.MeSummary;

/// <summary>Integration tests for GET /drivers/me/summary, GET /drivers/me/orders, and ActiveOrderId on GET /drivers/me.</summary>
[Collection(TestCollections.Database)]
public sealed class DriverMeSummaryTests(PostgresFixture fixture)
{
    // ── Fixed time ─────────────────────────────────────────────────────────
    // FakeTimeProvider is pinned to 2026-09-10 12:00:00 UTC.
    // Europe/Prague on 2026-09-10 is UTC+2 (CEST), so local time is 14:00.
    // "Today" Prague = 2026-09-10. UTC window: 2026-09-09T22:00Z → 2026-09-10T22:00Z.

    private static readonly DateTimeOffset FixedNow = new(2026, 9, 10, 12, 0, 0, TimeSpan.Zero);

    // UTC window for 2026-09-10 Prague day.
    private static readonly DateTimeOffset DayStart = new(2026, 9, 9, 22, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset DayEnd = new(2026, 9, 10, 22, 0, 0, TimeSpan.Zero);

    // ── Seed helpers ──────────────────────────────────────────────────────────

    private static async Task<(Fleet fleet, Driver driver, User driverUser)>
        SeedFleetAndDriver(TaxiDbContext db, CancellationToken ct = default)
    {
        var suffix = Guid.NewGuid().ToString("N");

        var fleet = new Fleet
        {
            Id = Guid.CreateVersion7(),
            Slug = $"me-{suffix}",
            Name = "MeSummary Test Fleet",
            Phone = "+420600111001",
            Currency = "CZK",
            TimeZone = "Europe/Prague",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        };
        db.Fleets.Add(fleet);
        await db.SaveChangesAsync(ct);

        var vehicle = new Vehicle
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            Plate = $"SUM{suffix[..4].ToUpperInvariant()}",
            Make = "Skoda",
            Model = "Octavia",
            Color = "Red",
            Seats = 4,
            IsActive = true
        };

        var driverUser = new User
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            Role = UserRole.Driver,
            Phone = $"+4206002{suffix[..9]}",
            DisplayName = "Summary Driver",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        };

        var driver = new Driver
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            UserId = driverUser.Id,
            Status = DriverStatus.Free,
            CurrentVehicleId = vehicle.Id,
            IsActive = true
        };

        db.Users.Add(driverUser);
        db.Vehicles.Add(vehicle);
        db.Drivers.Add(driver);
        await db.SaveChangesAsync(ct);

        return (fleet, driver, driverUser);
    }

    private static Order BuildCompletedOrder(Guid fleetId, Guid driverId, PaymentType paymentType, int finalPrice,
        DateTimeOffset completedAt) => new()
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleetId,
            DriverId = driverId,
            PublicCode = $"S{Guid.NewGuid():N}"[..6].ToUpperInvariant(),
            Status = OrderStatus.Completed,
            CustomerPhone = "+420600000001",
            PickupAddress = "Summary Pickup St",
            Source = OrderSource.Dispatcher,
            PriceType = PriceType.Estimate,
            FinalPriceCzk = finalPrice,
            PaymentType = paymentType,
            CompletedAt = completedAt,
            CreatedAt = completedAt.AddMinutes(-30),
            UpdatedAt = completedAt,
            AssignedAt = completedAt.AddMinutes(-25),
            Version = 1
        };

    // ── Test 1: Summary counts rides and totals per payment type ─────────────

    /// <summary>Summary returns the correct ride count and per-payment-type totals.</summary>
    [Fact]
    public async Task Summary_CountsOwnCompletedRides_AndTotalsPerPaymentType()
    {
        var ct = TestContext.Current.CancellationToken;

        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var (fleet, driver, driverUser) = await SeedFleetAndDriver(db, ct);

        // Seed completed orders in window.
        var midDay = DayStart.AddHours(6); // within the 2026-09-10 Prague window
        db.Orders.Add(BuildCompletedOrder(fleet.Id, driver.Id, PaymentType.Cash, 150, midDay));
        db.Orders.Add(BuildCompletedOrder(fleet.Id, driver.Id, PaymentType.Card, 200, midDay.AddHours(1)));
        db.Orders.Add(BuildCompletedOrder(fleet.Id, driver.Id, PaymentType.Invoice, 100, midDay.AddHours(2)));
        db.Orders.Add(BuildCompletedOrder(fleet.Id, driver.Id, PaymentType.Cash, 80, midDay.AddHours(3)));
        await db.SaveChangesAsync(ct);

        var client = fixture.Factory.CreateClient();
        client.AsDriver(fleet.Id, driverUser.Id);

        var resp = await client.GetAsync("/api/v1/drivers/me/summary?date=2026-09-10", ct);
        resp.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await resp.Content.ReadFromJsonAsync<GetMySummaryResponse>(cancellationToken: ct);
        body.Should().NotBeNull();
        body!.RidesCount.Should().Be(4);
        body.CashTotalCzk.Should().Be(230, "150 + 80");
        body.CardTotalCzk.Should().Be(200);
        body.InvoiceTotalCzk.Should().Be(100);
    }

    // ── Test 2: hoursOnline includes open shift ───────────────────────────────

    /// <summary>hoursOnline sums shift durations including the open shift, clamped to the window.</summary>
    [Fact]
    public async Task Summary_HoursOnline_IncludesOpenShift()
    {
        var ct = TestContext.Current.CancellationToken;

        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var (fleet, driver, driverUser) = await SeedFleetAndDriver(db, ct);

        // Seed a closed shift: 3 hours within the window.
        db.DriverShifts.Add(new DriverShift
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            DriverId = driver.Id,
            VehicleId = driver.CurrentVehicleId!.Value,
            StartedAt = DayStart.AddHours(2), // 2026-09-10 00:00 Prague
            EndedAt = DayStart.AddHours(5)    // 2026-09-10 03:00 Prague
        });

        // Seed an open shift: started 2 hours before FixedNow (2026-09-10 10:00 UTC = 12:00 Prague).
        db.DriverShifts.Add(new DriverShift
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            DriverId = driver.Id,
            VehicleId = driver.CurrentVehicleId!.Value,
            StartedAt = FixedNow.AddHours(-2), // 10:00 UTC
            EndedAt = null
        });
        await db.SaveChangesAsync(ct);

        var client = fixture.Factory.CreateClient();
        client.AsDriver(fleet.Id, driverUser.Id);

        var resp = await client.GetAsync("/api/v1/drivers/me/summary?date=2026-09-10", ct);
        resp.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await resp.Content.ReadFromJsonAsync<GetMySummaryResponse>(cancellationToken: ct);
        body.Should().NotBeNull();
        // 3 hours closed + 2 hours open = 5 hours total.
        body!.HoursOnline.Should().BeApproximately(5.0, 0.1);
    }

    // ── Test 3: Driver isolation ──────────────────────────────────────────────

    /// <summary>Driver B cannot see Driver A's rides in the summary (both in same fleet).</summary>
    [Fact]
    public async Task Summary_DriverB_CannotSeeDriverAsRides()
    {
        var ct = TestContext.Current.CancellationToken;

        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var (fleet, driverA, _) = await SeedFleetAndDriver(db, ct);

        // Seed Driver B in the SAME fleet as Driver A.
        var suffixB = Guid.NewGuid().ToString("N");
        var driverBUser = new User
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            Role = UserRole.Driver,
            Phone = $"+4206001{suffixB[..9]}",
            DisplayName = "Driver B",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        };
        var vehicleB = new Vehicle
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            Plate = $"DVB{suffixB[..4].ToUpperInvariant()}",
            Make = "VW",
            Model = "Passat",
            Color = "Black",
            Seats = 4,
            IsActive = true
        };
        var driverB = new Driver
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            UserId = driverBUser.Id,
            Status = DriverStatus.Free,
            CurrentVehicleId = vehicleB.Id,
            IsActive = true
        };
        db.Users.Add(driverBUser);
        db.Vehicles.Add(vehicleB);
        db.Drivers.Add(driverB);
        await db.SaveChangesAsync(ct);

        // Seed completed orders only for driver A.
        db.Orders.Add(BuildCompletedOrder(fleet.Id, driverA.Id, PaymentType.Cash, 100, DayStart.AddHours(4)));
        await db.SaveChangesAsync(ct);

        // Driver B calls summary — should see 0 rides.
        var client = fixture.Factory.CreateClient();
        client.AsDriver(fleet.Id, driverBUser.Id);

        var resp = await client.GetAsync("/api/v1/drivers/me/summary?date=2026-09-10", ct);
        resp.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await resp.Content.ReadFromJsonAsync<GetMySummaryResponse>(cancellationToken: ct);
        body!.RidesCount.Should().Be(0, "driver B should not see driver A's rides");
    }

    // ── Test 4: Tenant isolation ──────────────────────────────────────────────

    /// <summary>Summary only returns rides from the calling driver's fleet.</summary>
    [Fact]
    public async Task Summary_CrossTenant_ReturnsOwnFleetOnly()
    {
        var ct = TestContext.Current.CancellationToken;

        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var (fleetA, driverA, driverAUser) = await SeedFleetAndDriver(db, ct);
        var (fleetB, driverB, _) = await SeedFleetAndDriver(db, ct);

        // Seed a completed order in fleet B.
        db.Orders.Add(BuildCompletedOrder(fleetB.Id, driverB.Id, PaymentType.Cash, 999, DayStart.AddHours(5)));
        // Seed a completed order in fleet A for driverA.
        db.Orders.Add(BuildCompletedOrder(fleetA.Id, driverA.Id, PaymentType.Cash, 100, DayStart.AddHours(5)));
        await db.SaveChangesAsync(ct);

        // Driver A in fleet A calls summary.
        var client = fixture.Factory.CreateClient();
        client.AsDriver(fleetA.Id, driverAUser.Id);

        var resp = await client.GetAsync("/api/v1/drivers/me/summary?date=2026-09-10", ct);
        resp.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await resp.Content.ReadFromJsonAsync<GetMySummaryResponse>(cancellationToken: ct);
        body!.RidesCount.Should().Be(1, "should only count own rides, not fleet B's");
        body.CashTotalCzk.Should().Be(100, "should only sum own fleet's rides");
    }

    // ── Test 5: Orders list ───────────────────────────────────────────────────

    /// <summary>Orders list includes own completed and active rides for the date.</summary>
    [Fact]
    public async Task Orders_ListsOwnCompletedAndActiveRidesForDate()
    {
        var ct = TestContext.Current.CancellationToken;

        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var (fleet, driver, driverUser) = await SeedFleetAndDriver(db, ct);

        var completedOrder = BuildCompletedOrder(fleet.Id, driver.Id, PaymentType.Cash, 150, DayStart.AddHours(6));

        // Seed an active order (Accepted) created today.
        var activeOrder = new Order
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            DriverId = driver.Id,
            PublicCode = $"A{Guid.NewGuid():N}"[..6].ToUpperInvariant(),
            Status = OrderStatus.Accepted,
            CustomerPhone = "+420600000002",
            PickupAddress = "Active Pickup St",
            Source = OrderSource.Dispatcher,
            PriceType = PriceType.Estimate,
            CreatedAt = DayStart.AddHours(8), // within window
            UpdatedAt = DayStart.AddHours(8),
            AssignedAt = DayStart.AddHours(8),
            Version = 1
        };

        db.Orders.Add(completedOrder);
        db.Orders.Add(activeOrder);
        await db.SaveChangesAsync(ct);

        var client = fixture.Factory.CreateClient();
        client.AsDriver(fleet.Id, driverUser.Id);

        var resp = await client.GetAsync("/api/v1/drivers/me/orders?date=2026-09-10", ct);
        resp.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await resp.Content.ReadFromJsonAsync<OrdersResponseWrapper>(cancellationToken: ct);
        body.Should().NotBeNull();
        body!.Orders.Should().HaveCount(2, "should include both completed and active orders");
        body.Orders.Should().Contain(o => o.Id == completedOrder.Id);
        body.Orders.Should().Contain(o => o.Id == activeOrder.Id);
    }

    // ── Test 6: GetMe returns ActiveOrderId ──────────────────────────────────

    /// <summary>GET /drivers/me returns the driver's non-terminal order id when in progress.</summary>
    [Fact]
    public async Task GetMe_ReturnsActiveOrderId_WhenRideInProgress()
    {
        var ct = TestContext.Current.CancellationToken;

        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var (fleet, driver, driverUser) = await SeedFleetAndDriver(db, ct);

        // Seed an InProgress order.
        var activeOrder = new Order
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            DriverId = driver.Id,
            PublicCode = $"P{Guid.NewGuid():N}"[..6].ToUpperInvariant(),
            Status = OrderStatus.InProgress,
            CustomerPhone = "+420600000003",
            PickupAddress = "InProgress Pickup St",
            Source = OrderSource.Dispatcher,
            PriceType = PriceType.Estimate,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow,
            Version = 1
        };
        db.Orders.Add(activeOrder);
        await db.SaveChangesAsync(ct);

        var client = fixture.Factory.CreateClient();
        client.AsDriver(fleet.Id, driverUser.Id);

        var resp = await client.GetAsync("/api/v1/drivers/me", ct);
        resp.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await resp.Content.ReadFromJsonAsync<GetMeResponse>(cancellationToken: ct);
        body.Should().NotBeNull();
        body!.ActiveOrderId.Should().Be(activeOrder.Id, "should return the in-progress order id");
    }

    // ── Test 7: Invalid date → 400 ────────────────────────────────────────────

    /// <summary>A non-null, non-parseable date returns 400 InvalidDateFormat.</summary>
    [Fact]
    public async Task Summary_InvalidDate_Returns400()
    {
        var ct = TestContext.Current.CancellationToken;

        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var (fleet, _, driverUser) = await SeedFleetAndDriver(db, ct);

        var client = fixture.Factory.CreateClient();
        client.AsDriver(fleet.Id, driverUser.Id);

        var resp = await client.GetAsync("/api/v1/drivers/me/summary?date=not-a-date", ct);
        resp.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var body = await resp.Content.ReadAsStringAsync(ct);
        body.Should().Contain(ErrorCodes.Validation.InvalidDateFormat);
    }

    // ── Test 8 (F-ME-01): Active orders always included regardless of date ─────

    /// <summary>An active (non-terminal) order created BEFORE the query date window is still included
    /// in the orders list — it represents "today's work" in progress.</summary>
    [Fact]
    public async Task Orders_ActiveOrderCreatedBeforeDateWindow_AlwaysIncluded()
    {
        var ct = TestContext.Current.CancellationToken;

        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var (fleet, driver, driverUser) = await SeedFleetAndDriver(db, ct);

        // Active order created 5 hours BEFORE the day window starts (i.e., yesterday Prague time).
        var activeOrder = new Order
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            DriverId = driver.Id,
            PublicCode = $"B{Guid.NewGuid():N}"[..6].ToUpperInvariant(),
            Status = OrderStatus.Arrived,
            CustomerPhone = "+420600000010",
            PickupAddress = "Old Active Pickup",
            Source = OrderSource.Dispatcher,
            PriceType = PriceType.Estimate,
            CreatedAt = DayStart.AddHours(-5), // BEFORE window — should still appear
            UpdatedAt = DayStart.AddHours(-5),
            AssignedAt = DayStart.AddHours(-5),
            Version = 1
        };

        db.Orders.Add(activeOrder);
        await db.SaveChangesAsync(ct);

        var client = fixture.Factory.CreateClient();
        client.AsDriver(fleet.Id, driverUser.Id);

        var resp = await client.GetAsync("/api/v1/drivers/me/orders?date=2026-09-10", ct);
        resp.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await resp.Content.ReadFromJsonAsync<OrdersResponseWrapper>(cancellationToken: ct);
        body.Should().NotBeNull();
        body!.Orders.Should().Contain(o => o.Id == activeOrder.Id,
            "active orders must always be included regardless of CreatedAt date window");
    }

    // ── Helper record shapes for deserialization ──────────────────────────────

    private sealed record OrdersResponseWrapper(IReadOnlyList<OrderSummaryItem> Orders);
    private sealed record OrderSummaryItem(Guid Id, string PublicCode, string Status);
}

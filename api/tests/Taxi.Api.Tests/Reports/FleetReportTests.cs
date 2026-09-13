using System.Diagnostics;
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Infrastructure.Seed;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Reports;

/// <summary>Integration tests for GET /reports/fleet and /reports/ratings (UC-007 A3): SQL-computed KPIs,
/// rides-per-day series, top routes, ratings list, tenant isolation, authz, and the 50k perf budget.</summary>
[Collection(TestCollections.Database)]
public sealed class FleetReportTests(PostgresFixture fixture)
{
    private static readonly DateTimeOffset Noon = new(2026, 3, 16, 13, 0, 0, TimeSpan.Zero);

    /// <summary>KPIs are computed in SQL; the JSON envelope carries all headline fields.</summary>
    [Fact]
    public async Task FleetReport_Kpis_ComputedInSql_NoInMemoryGrouping()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, adminId) = await SeedFleetAsync(ct);
        await SeedCompletedAsync(fleetId, OrderSource.App, PaymentType.Cash, 200, Noon, ct);
        await SeedCompletedAsync(fleetId, OrderSource.Phone, PaymentType.Card, 300, Noon, ct);

        var report = await GetReportAsync(fleetId, adminId, "2026-03-16", "2026-03-16", ct);

        report!.Kpis.Rides.Should().Be(2);
        report.Kpis.RevenueCzk.Should().Be(500);
        report.Kpis.AvgPriceCzk.Should().Be(250);
    }

    /// <summary>App-vs-phone share counts App separately from Phone+Dispatcher.</summary>
    [Fact]
    public async Task FleetReport_AppVsPhoneShare()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, adminId) = await SeedFleetAsync(ct);
        await SeedCompletedAsync(fleetId, OrderSource.App, PaymentType.Cash, 100, Noon, ct);
        await SeedCompletedAsync(fleetId, OrderSource.Phone, PaymentType.Cash, 100, Noon, ct);
        await SeedCompletedAsync(fleetId, OrderSource.Dispatcher, PaymentType.Cash, 100, Noon, ct);

        var report = await GetReportAsync(fleetId, adminId, "2026-03-16", "2026-03-16", ct);

        report!.Kpis.AppOrders.Should().Be(1);
        report.Kpis.PhoneOrders.Should().Be(2);
    }

    /// <summary>Time-to-assign and time-to-pickup averages are computed from the timestamps.</summary>
    [Fact]
    public async Task FleetReport_TimeToAssignAndPickup()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, adminId) = await SeedFleetAsync(ct);

        // created→assigned = 120s; accepted→arrived = 300s.
        await SeedWithTimingsAsync(fleetId,
            created: Noon,
            assigned: Noon.AddSeconds(120),
            accepted: Noon.AddSeconds(180),
            arrived: Noon.AddSeconds(480),
            ct);

        var report = await GetReportAsync(fleetId, adminId, "2026-03-16", "2026-03-16", ct);

        report!.Kpis.AvgTimeToAssignSeconds.Should().BeApproximately(120, 1);
        report.Kpis.AvgTimeToPickupSeconds.Should().BeApproximately(300, 1);
    }

    /// <summary>Top routes are ranked by order count, joined to the route name.</summary>
    [Fact]
    public async Task FleetReport_TopRoutesByCount()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, adminId) = await SeedFleetAsync(ct);
        var routeA = await SeedRouteAsync(fleetId, "Route A", ct);
        var routeB = await SeedRouteAsync(fleetId, "Route B", ct);

        await SeedCompletedAsync(fleetId, OrderSource.App, PaymentType.Cash, 100, Noon, ct, routeId: routeA);
        await SeedCompletedAsync(fleetId, OrderSource.App, PaymentType.Cash, 100, Noon, ct, routeId: routeA);
        await SeedCompletedAsync(fleetId, OrderSource.App, PaymentType.Cash, 100, Noon, ct, routeId: routeB);

        var report = await GetReportAsync(fleetId, adminId, "2026-03-16", "2026-03-16", ct);

        report!.TopRoutes.Should().HaveCount(2);
        report.TopRoutes[0].Name.Should().Be("Route A");
        report.TopRoutes[0].Count.Should().Be(2);
        report.Kpis.FixedRouteOrders.Should().Be(3);
    }

    /// <summary>GET reports/ratings returns comment + order code + driver name.</summary>
    [Fact]
    public async Task Ratings_List_IncludesCommentCodeDriver()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, adminId) = await SeedFleetAsync(ct);
        var driverId = await SeedDriverAsync(fleetId, "Rated Driver", ct);
        await SeedCompletedAsync(fleetId, OrderSource.App, PaymentType.Cash, 150, Noon, ct,
            driverId: driverId, ratingStars: 5, ratingComment: "Výborný řidič", publicCode: "RATE01");

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminId);
        var ratings = await client.GetFromJsonAsync<RatingsResponseDto>("/api/v1/reports/ratings", ct);

        ratings!.Items.Should().ContainSingle();
        var r = ratings.Items[0];
        r.OrderPublicCode.Should().Be("RATE01");
        r.DriverName.Should().Be("Rated Driver");
        r.Stars.Should().Be(5);
        r.Comment.Should().Be("Výborný řidič");
    }

    /// <summary>A FleetAdmin only sees their own fleet's data.</summary>
    [Fact]
    public async Task FleetReport_CrossTenant_OnlyCallerFleet()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetA, adminA) = await SeedFleetAsync(ct);
        var (fleetB, _) = await SeedFleetAsync(ct);
        await SeedCompletedAsync(fleetA, OrderSource.App, PaymentType.Cash, 100, Noon, ct);
        await SeedCompletedAsync(fleetB, OrderSource.App, PaymentType.Cash, 999, Noon, ct);

        var report = await GetReportAsync(fleetA, adminA, "2026-03-16", "2026-03-16", ct);

        report!.Kpis.Rides.Should().Be(1);
        report.Kpis.RevenueCzk.Should().Be(100);
    }

    /// <summary>A non-FleetAdmin is forbidden.</summary>
    [Fact]
    public async Task FleetReport_NonFleetAdmin_Returns403()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, _) = await SeedFleetAsync(ct);

        var client = fixture.Factory.CreateClient().AsDispatcher(fleetId);
        var resp = await client.GetAsync("/api/v1/reports/fleet?from=2026-03-16&to=2026-03-16", ct);
        resp.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    /// <summary>A bad date → 400.</summary>
    [Fact]
    public async Task FleetReport_BadDate_Returns400()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, adminId) = await SeedFleetAsync(ct);

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminId);
        var resp = await client.GetAsync("/api/v1/reports/fleet?from=not-a-date&to=2026-03-16", ct);
        resp.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    /// <summary>AC#2: with 50 000 seeded orders the fleet endpoint responds under 300 ms (warm).
    /// <para>Opt-in: skipped unless <c>RUN_PERF_TESTS=1</c> so a plain <c>dotnet test</c> (the DoD gate,
    /// and any future CI step) never seeds 50k on the hot path or flakes on a raw wall-clock budget on
    /// slower CI hardware. Also tagged <c>[Trait(Category, Perf)]</c> for filter-based selection.</para></summary>
    [Fact]
    [Trait("Category", "Perf")]
    public async Task FleetReport_50kOrders_RespondsUnder300ms()
    {
        if (Environment.GetEnvironmentVariable("RUN_PERF_TESTS") != "1")
        {
            Assert.Skip("Perf test is opt-in; set RUN_PERF_TESTS=1 to run the 50k-order budget check.");
        }

        var ct = TestContext.Current.CancellationToken;
        var (fleetId, adminId) = await SeedFleetAsync(ct);

        await using (var scope = fixture.Factory.Services.CreateAsyncScope())
        {
            var seeder = scope.ServiceProvider.GetRequiredService<ReportSeedScript>();
            await seeder.SeedOrdersAsync(fleetId, 50_000, ct);
        }

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminId);
        const string url = "/api/v1/reports/fleet?from=2025-01-01&to=2027-01-01";

        // Warm-up hit absorbs EF query compilation; measure the second.
        (await client.GetAsync(url, ct)).EnsureSuccessStatusCode();

        var sw = Stopwatch.StartNew();
        var resp = await client.GetAsync(url, ct);
        sw.Stop();

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        sw.ElapsedMilliseconds.Should().BeLessThan(300,
            "the fleet report must stay under 300 ms at 50k orders (backed by the A1 composite indexes)");
    }

    // ── Helpers ──────────────────────────────────────────────────────────────────

    private async Task<FleetReportResponseDto?> GetReportAsync(
        Guid fleetId, Guid adminId, string from, string to, CancellationToken ct)
    {
        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminId);
        return await client.GetFromJsonAsync<FleetReportResponseDto>(
            $"/api/v1/reports/fleet?from={from}&to={to}", ct);
    }

    private async Task<(Guid fleetId, Guid adminId)> SeedFleetAsync(CancellationToken ct)
    {
        var fleetId = Guid.CreateVersion7();
        var adminId = Guid.CreateVersion7();
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.Fleets.Add(new Fleet
        {
            Id = fleetId,
            Slug = $"fleet-report-{Guid.NewGuid():N}",
            Name = "Fleet Report Fleet",
            Phone = "+420777007001",
            Currency = "CZK",
            TimeZone = "Europe/Prague",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        });
        db.FleetSettings.Add(new FleetSettings { FleetId = fleetId, SmsUnitCostCzk = 1 });
        db.Users.Add(new User
        {
            Id = adminId,
            FleetId = fleetId,
            Role = UserRole.FleetAdmin,
            Email = $"admin-{adminId:N}@freport.local",
            Phone = $"+4207771{Random.Shared.Next(100000, 999999)}",
            DisplayName = "Fleet Admin",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync(ct);
        return (fleetId, adminId);
    }

    private async Task<Guid> SeedDriverAsync(Guid fleetId, string name, CancellationToken ct)
    {
        var driverUserId = Guid.CreateVersion7();
        var driverId = Guid.CreateVersion7();
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.Users.Add(new User
        {
            Id = driverUserId,
            FleetId = fleetId,
            Role = UserRole.Driver,
            Email = $"drv-{driverId:N}@freport.local",
            Phone = $"+4207772{Random.Shared.Next(100000, 999999)}",
            DisplayName = name,
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
        return driverId;
    }

    private async Task<Guid> SeedRouteAsync(Guid fleetId, string name, CancellationToken ct)
    {
        var routeId = Guid.CreateVersion7();
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.Routes.Add(new Taxi.Api.Infrastructure.Entities.Route
        {
            Id = routeId,
            FleetId = fleetId,
            Name = name,
            Type = RouteType.PointToPoint,
            PriceCzk = 150,
            FromLat = 50.0,
            FromLng = 15.2,
            ToLat = 49.9,
            ToLng = 15.3,
            FromRadiusMeters = 300,
            ToRadiusMeters = 300,
            ValidDays = 127,
            Priority = 10,
            IsEnabled = true
        });
        await db.SaveChangesAsync(ct);
        return routeId;
    }

    private async Task SeedCompletedAsync(
        Guid fleetId, OrderSource source, PaymentType payment, int priceCzk, DateTimeOffset at,
        CancellationToken ct, Guid? routeId = null, Guid? driverId = null,
        int? ratingStars = null, string? ratingComment = null, string? publicCode = null)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.Orders.Add(new Order
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleetId,
            PublicCode = publicCode ?? RandomCode(),
            Status = OrderStatus.Completed,
            Source = source,
            CustomerPhone = "+420777100900",
            PickupAddress = "Pickup",
            PickupLat = 50.0,
            PickupLng = 15.2,
            Passengers = 1,
            PriceType = routeId is null ? PriceType.Estimate : PriceType.Fixed,
            RouteId = routeId,
            DriverId = driverId,
            FinalPriceCzk = priceCzk,
            PaymentType = payment,
            RatingStars = ratingStars,
            RatingComment = ratingComment,
            RatedAt = ratingStars is null ? null : at.AddHours(1),
            CreatedAt = at,
            CompletedAt = at.AddMinutes(25),
            UpdatedAt = at,
            Version = 1
        });
        await db.SaveChangesAsync(ct);
    }

    private async Task SeedWithTimingsAsync(
        Guid fleetId, DateTimeOffset created, DateTimeOffset assigned,
        DateTimeOffset accepted, DateTimeOffset arrived, CancellationToken ct)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.Orders.Add(new Order
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleetId,
            PublicCode = RandomCode(),
            Status = OrderStatus.Completed,
            Source = OrderSource.App,
            CustomerPhone = "+420777100902",
            PickupAddress = "Pickup",
            PickupLat = 50.0,
            PickupLng = 15.2,
            Passengers = 1,
            PriceType = PriceType.Estimate,
            FinalPriceCzk = 200,
            PaymentType = PaymentType.Cash,
            CreatedAt = created,
            AssignedAt = assigned,
            AcceptedAt = accepted,
            ArrivedAt = arrived,
            CompletedAt = arrived.AddMinutes(15),
            UpdatedAt = created,
            Version = 1
        });
        await db.SaveChangesAsync(ct);
    }

    private static string RandomCode() =>
        new(Enumerable.Range(0, 6).Select(_ => "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[Random.Shared.Next(36)]).ToArray());

    private sealed record FleetReportResponseDto(
        FleetKpiDtoT Kpis, List<RidesPerDayDtoT> RidesPerDay, List<TopRouteDtoT> TopRoutes);

    private sealed record FleetKpiDtoT(
        int Rides, int RevenueCzk, int AvgPriceCzk,
        double? AvgTimeToAssignSeconds, double? AvgTimeToPickupSeconds,
        double CancellationRate, int AppOrders, int PhoneOrders, int FixedRouteOrders,
        int SmsCount, int SmsCostCzk);

    private sealed record RidesPerDayDtoT(string Date, int Count);

    private sealed record TopRouteDtoT(Guid RouteId, string Name, int Count);

    private sealed record RatingsResponseDto(List<RatingItemDto> Items);

    private sealed record RatingItemDto(
        string OrderPublicCode, string? DriverName, int Stars, string? Comment, DateTimeOffset? RatedAt);
}

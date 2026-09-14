using System.Diagnostics;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Infrastructure.Seed;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Analytics;

/// <summary>Integration tests for GET /api/v1/analytics/demand (WI-05):
/// demand heatmap, supply-vs-demand buckets, unmet demand, utilization, zone pickup counts,
/// top routes, tenant isolation, perf &lt;500 ms @ 50k.</summary>
[Collection(TestCollections.Database)]
public sealed class GetDemandTests(PostgresFixture fixture)
{
    // All fixture orders fall on 2026-09-10 in Prague time (UTC+2 in September).
    // 2026-09-10T08:00 Prague = 2026-09-10T06:00 UTC (DOW=4 Thursday, hour=8 Prague local).
    private static readonly DateTimeOffset Sep10PragueAsUtc = new(2026, 9, 10, 6, 0, 0, TimeSpan.Zero);

    // ── Happy path — hand-computed fixture ────────────────────────────────────

    /// <summary>Seeds a small fixture with known orders and shifts, then verifies the heatmap
    /// and supply-vs-demand buckets have exactly the right values.
    /// <para>Fixture:
    ///   - 3 orders at Prague hour 8 on Sep 10 (DOW=4, Thursday).
    ///   - 1 driver shift: 07:00-10:00 Prague = 3 online hours covering hour buckets 7, 8, 9.
    ///   - Verified: heatmap row (hour=8, dow=4, count=3); supply bucket for hour 8 has demand=3
    ///     and onlineSeconds>0; fulfillmentRate=1.0 (all completed).
    /// </para></summary>
    [Fact]
    public async Task HandleAsync_HandComputedFixture_ReturnsHeatmapAndSupplyDemand()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, adminId) = await SeedFleetAsync(ct);
        var (driverIdA, _) = await SeedDriverAsync(fleetId, "A", ct);
        var custId = await SeedCustomerAsync(ct);

        // 1 shift: 07:00–10:00 Prague = 05:00–08:00 UTC. Covers hour buckets 5,6,7 UTC = 7,8,9 Prague.
        await SeedShiftAsync(fleetId, driverIdA,
            Sep10PragueAsUtc.AddHours(-1), // 05:00 UTC = 07:00 Prague
            Sep10PragueAsUtc.AddHours(2),  // 08:00 UTC = 10:00 Prague
            ct);

        // 3 completed orders created at Sep10 06:00 UTC = 08:00 Prague (hour=8, DOW=4 Thursday).
        await SeedOrderAsync(fleetId, OrderStatus.Completed, 200, driverIdA, custId, Sep10PragueAsUtc,
            pickupLat: 50.08, pickupLng: 14.43,
            acceptedAt: Sep10PragueAsUtc.AddMinutes(5), completedAt: Sep10PragueAsUtc.AddMinutes(25),
            ct: ct);
        await SeedOrderAsync(fleetId, OrderStatus.Completed, 300, driverIdA, custId, Sep10PragueAsUtc,
            pickupLat: 50.08, pickupLng: 14.43,
            acceptedAt: Sep10PragueAsUtc.AddMinutes(8), completedAt: Sep10PragueAsUtc.AddMinutes(30),
            ct: ct);
        await SeedOrderAsync(fleetId, OrderStatus.Completed, 100, driverIdA, custId, Sep10PragueAsUtc,
            pickupLat: 50.08, pickupLng: 14.43,
            acceptedAt: Sep10PragueAsUtc.AddMinutes(10), completedAt: Sep10PragueAsUtc.AddMinutes(35),
            ct: ct);

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminId);
        var resp = await client.GetAsync(
            "/api/v1/analytics/demand?from=2026-09-10&to=2026-09-10", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<GetDemandResponseDto>(ct);

        body.Should().NotBeNull();

        // Heatmap: hour=8, dow=4 (Thursday), count=3.
        var heatRow = body!.Heatmap.FirstOrDefault(r => r.Hour == 8 && r.Dow == 4);
        heatRow.Should().NotBeNull("must have a heatmap cell for Prague hour 8 / Thursday");
        heatRow!.Count.Should().Be(3, "3 orders created at Prague hour 8 on Thursday");

        // Supply-vs-demand for hour-of-day 8 (Prague local): demand=3, online seconds>0.
        var sdRow = body.SupplyDemand.FirstOrDefault(r => r.Hour == 8);
        sdRow.Should().NotBeNull("must have a supply-demand row for Prague hour 8");
        sdRow!.OrdersCreated.Should().Be(3, "3 orders created at Prague hour 8");
        sdRow.OnlineSeconds.Should().BeGreaterThan(0, "the shift covers Prague hour 8");

        // FulfillmentRate = 3 completed / 3 total = 1.0 (all completed).
        sdRow.FulfillmentRate.Should().BeApproximately(1.0, 0.01);
    }

    // ── Unmet demand ──────────────────────────────────────────────────────────

    /// <summary>Unmet demand = cancelled orders where no Accepted event was ever recorded.
    /// Seeds 2 cancelled orders with no Accepted event (one has a Timeout event, one has nothing),
    /// and 1 cancelled order WITH an Accepted event (must NOT count as unmet).
    /// Expects unmet_count=2 for Prague hour 8.</summary>
    [Fact]
    public async Task HandleAsync_UnmetDemand_CountsNeverAcceptedCancellations()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, adminId) = await SeedFleetAsync(ct);
        var (driverIdA, driverUserIdA) = await SeedDriverAsync(fleetId, "A", ct);

        // Seed a dispatcher user for the actor FK in order events.
        var dispatcherUserId = await SeedDispatcherAsync(fleetId, ct);

        // Order 1: cancelled, Timeout event only, no Accepted → unmet.
        var orderId1 = await SeedOrderAsync(fleetId, OrderStatus.Cancelled, 0, null, null, Sep10PragueAsUtc,
            ct: ct);
        await SeedOrderEventAsync(fleetId, orderId1, OrderEventType.Timeout,
            OrderStatus.Assigned, OrderStatus.New, dispatcherUserId, Sep10PragueAsUtc.AddMinutes(2), ct);

        // Order 2: cancelled, no events at all → unmet.
        await SeedOrderAsync(fleetId, OrderStatus.Cancelled, 0, null, null, Sep10PragueAsUtc,
            ct: ct);

        // Order 3: cancelled, but has Accepted event → NOT unmet (driver was once assigned).
        var orderId3 = await SeedOrderAsync(fleetId, OrderStatus.Cancelled, 0, driverIdA, null, Sep10PragueAsUtc,
            ct: ct);
        await SeedOrderEventAsync(fleetId, orderId3, OrderEventType.Accepted,
            OrderStatus.Assigned, OrderStatus.Accepted, driverUserIdA, Sep10PragueAsUtc.AddMinutes(3), ct);

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminId);
        var resp = await client.GetAsync(
            "/api/v1/analytics/demand?from=2026-09-10&to=2026-09-10", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<GetDemandResponseDto>(ct);

        body.Should().NotBeNull();

        // Unmet: only the 2 orders with no Accepted event count.
        var unmetRow = body!.UnmetDemand.FirstOrDefault(r => r.Hour == 8);
        unmetRow.Should().NotBeNull("must have an unmet demand row for Prague hour 8");
        unmetRow!.UnmetCount.Should().Be(2, "2 cancelled orders had no driver ever accept");
    }

    // ── Zone bounding-box pickups ─────────────────────────────────────────────

    /// <summary>Zone pickup attribution via bounding-box: seeds one circle zone and one polygon zone,
    /// places orders at known lat/lng coordinates, and expects the pickup counts to be correct.
    /// Includes a discriminating point at (50.08, 14.443) — ~928m from center — which is INSIDE
    /// the correct radians-derived bbox (upper lng ≈14.444) but would be OUTSIDE a buggy degrees-based
    /// bbox (upper lng ≈14.439). This guards the Trap F fix (radians, not degrees, in Math.Cos).</summary>
    [Fact]
    public async Task HandleAsync_ZoneBoundingBox_AttributesPickups()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, adminId) = await SeedFleetAsync(ct);
        var (driverIdA, _) = await SeedDriverAsync(fleetId, "A", ct);
        var custId = await SeedCustomerAsync(ct);

        // Circle zone: center (50.08, 14.43), radius 1000m.
        // bbox lat: ±(1000/111320) ≈ ±0.008983 → [50.071017, 50.088983]
        // bbox lng: ±(1000/(111320*cos(50.08°*π/180))) ≈ ±0.013996 → [14.416004, 14.443996]
        // Discriminating point: (50.08, 14.443) is ~928m east (inside correct bbox, outside degrees-bug bbox).
        var circleZoneId = await SeedZoneAsync(fleetId, "Circle Zone",
            ZoneShape.Circle, centerLat: 50.08, centerLng: 14.43, radiusMeters: 1000.0,
            polygon: null, ct: ct);

        // Polygon zone: square from (50.09, 14.43) to (50.10, 14.45).
        var polyZoneId = await SeedZoneAsync(fleetId, "Polygon Zone",
            ZoneShape.Polygon, centerLat: 0, centerLng: 0, radiusMeters: null,
            polygon: "[[50.09,14.43],[50.09,14.45],[50.10,14.45],[50.10,14.43]]", ct: ct);

        // 2 orders inside circle zone (at center: 50.08, 14.43).
        await SeedOrderAsync(fleetId, OrderStatus.Completed, 100, driverIdA, custId, Sep10PragueAsUtc,
            pickupLat: 50.08, pickupLng: 14.43, ct: ct);
        await SeedOrderAsync(fleetId, OrderStatus.Completed, 100, driverIdA, custId, Sep10PragueAsUtc,
            pickupLat: 50.08, pickupLng: 14.43, ct: ct);

        // 1 order at discriminating point: (50.08, 14.443) — ~928m from center, inside correct bbox.
        // A bug that uses degrees instead of radians in Math.Cos would give lngDelta≈0.000898 → upper≈14.430898,
        // which would EXCLUDE this point. With correct radians: lngDelta≈0.013996 → upper≈14.443996, INCLUDED.
        await SeedOrderAsync(fleetId, OrderStatus.Completed, 100, driverIdA, custId, Sep10PragueAsUtc,
            pickupLat: 50.08, pickupLng: 14.443, ct: ct);

        // 1 order inside polygon zone (pickup at 50.095, 14.44 — inside the square).
        await SeedOrderAsync(fleetId, OrderStatus.Completed, 100, driverIdA, custId, Sep10PragueAsUtc,
            pickupLat: 50.095, pickupLng: 14.44, ct: ct);

        // 1 order outside both zones (pickup far away in London).
        await SeedOrderAsync(fleetId, OrderStatus.Completed, 100, driverIdA, custId, Sep10PragueAsUtc,
            pickupLat: 51.5, pickupLng: 0.0, ct: ct);

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminId);
        var resp = await client.GetAsync(
            "/api/v1/analytics/demand?from=2026-09-10&to=2026-09-10", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<GetDemandResponseDto>(ct);

        body.Should().NotBeNull();

        var circlePickups = body!.ZonePickups.FirstOrDefault(z => z.ZoneId == circleZoneId);
        circlePickups.Should().NotBeNull("circle zone must appear in zone pickups");
        circlePickups!.PickupCount.Should().Be(3,
            "2 orders at center + 1 discriminating point at (50.08, 14.443) all inside the radians-correct bbox");

        var polyPickups = body.ZonePickups.FirstOrDefault(z => z.ZoneId == polyZoneId);
        polyPickups.Should().NotBeNull("polygon zone must appear in zone pickups");
        polyPickups!.PickupCount.Should().Be(1, "1 order lands inside the polygon zone bounding box");
    }

    // ── compare=true runs doubled computation path ────────────────────────────

    /// <summary>compare=true must run all aggregation queries for both the requested period AND the
    /// prior equal-length period. The response includes a non-null Prior block with the prior heatmap.
    /// This guards that compare=true is not a no-op (perf AC requires the doubled-cost path).</summary>
    [Fact]
    public async Task HandleAsync_CompareTrue_ReturnsPriorHeatmap()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, adminId) = await SeedFleetAsync(ct);
        var (driverIdA, _) = await SeedDriverAsync(fleetId, "A", ct);
        var custId = await SeedCustomerAsync(ct);

        // Current window: Sep 10 — 1 order.
        await SeedOrderAsync(fleetId, OrderStatus.Completed, 100, driverIdA, custId, Sep10PragueAsUtc,
            ct: ct);

        // Prior window: Sep 9 (1 day window → prior = Sep 8, or depends on Resolve).
        // AnalyticsWindow.Resolve for a 1-day window produces prior = winStart-1day to winStart.
        // Sep 10 Prague = Sep 9 22:00 UTC to Sep 10 22:00 UTC.
        // Prior = Sep 8 22:00 UTC to Sep 9 22:00 UTC (= Sep 9 Prague day).
        // Plant 2 orders on Sep 9 (= 2026-09-09 06:00 UTC = Sep 9 08:00 Prague, hour=8).
        var sep9UtcEarlyAfternoon = new DateTimeOffset(2026, 9, 9, 6, 0, 0, TimeSpan.Zero);
        await SeedOrderAsync(fleetId, OrderStatus.Completed, 200, driverIdA, custId, sep9UtcEarlyAfternoon,
            ct: ct);
        await SeedOrderAsync(fleetId, OrderStatus.Completed, 200, driverIdA, custId, sep9UtcEarlyAfternoon,
            ct: ct);

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminId);
        var resp = await client.GetAsync(
            "/api/v1/analytics/demand?from=2026-09-10&to=2026-09-10&compare=true", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<GetDemandResponseDto>(ct);

        body.Should().NotBeNull();

        // Current period: 1 order on Sep 10.
        body!.Heatmap.Sum(r => r.Count).Should().Be(1, "current window has 1 order");

        // Prior period: 2 orders on Sep 9.
        body.Prior.Should().NotBeNull("compare=true must return a Prior block");
        body.Prior!.Heatmap.Sum(r => r.Count).Should().Be(2,
            "prior window (Sep 9) has 2 orders");
    }

    // ── Tenant isolation ──────────────────────────────────────────────────────

    /// <summary>Fleet A admin cannot see fleet B's demand data.</summary>
    [Fact]
    public async Task HandleAsync_FleetAScopedFromFleetB_ReturnsOnlyOwnData()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetA, adminA) = await SeedFleetAsync(ct);
        var (fleetB, _) = await SeedFleetAsync(ct);
        var (driverIdA, _) = await SeedDriverAsync(fleetA, "A", ct);
        var (driverIdB, _) = await SeedDriverAsync(fleetB, "B", ct);
        var custA = await SeedCustomerAsync(ct);
        var custB = await SeedCustomerAsync(ct);

        // Fleet A: 1 order at Prague hour 8.
        await SeedOrderAsync(fleetA, OrderStatus.Completed, 100, driverIdA, custA, Sep10PragueAsUtc,
            pickupLat: 50.08, pickupLng: 14.43, ct: ct);
        // Fleet B: 5 orders at Prague hour 8 — should not appear.
        for (var i = 0; i < 5; i++)
            await SeedOrderAsync(fleetB, OrderStatus.Completed, 200, driverIdB, custB, Sep10PragueAsUtc,
                pickupLat: 50.08, pickupLng: 14.43, ct: ct);

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetA, adminA);
        var resp = await client.GetAsync(
            "/api/v1/analytics/demand?from=2026-09-10&to=2026-09-10", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<GetDemandResponseDto>(ct);

        body.Should().NotBeNull();
        body!.Heatmap.Sum(r => r.Count).Should().Be(1, "only fleet A's 1 order appears in heatmap");
    }

    // ── Perf — 50k seed under 500 ms (opt-in) ────────────────────────────────

    /// <summary>AC perf: GET /demand must respond under 500 ms against 50 000 seeded orders,
    /// with compare=true (doubled compute cost).
    /// <para>Opt-in via <c>RUN_PERF_TESTS=1</c>.</para></summary>
    [Fact]
    [Trait("Category", "Perf")]
    public async Task HandleAsync_50kSeed_RespondsUnder500ms()
    {
        if (Environment.GetEnvironmentVariable("RUN_PERF_TESTS") != "1")
        {
            Assert.Skip("Perf test is opt-in; set RUN_PERF_TESTS=1 to run.");
        }

        var ct = TestContext.Current.CancellationToken;
        var (fleetId, adminId) = await SeedFleetAsync(ct);

        await using (var scope = fixture.Factory.Services.CreateAsyncScope())
        {
            var seeder = scope.ServiceProvider.GetRequiredService<ReportSeedScript>();
            await seeder.SeedOrdersAsync(fleetId, 50_000, ct);
        }

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminId);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var url = $"/api/v1/analytics/demand?from={today.AddDays(-90):yyyy-MM-dd}&to={today:yyyy-MM-dd}&compare=true";

        // Warm-up — absorbs EF query compilation.
        (await client.GetAsync(url, ct)).EnsureSuccessStatusCode();

        var sw = Stopwatch.StartNew();
        var resp = await client.GetAsync(url, ct);
        sw.Stop();

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        sw.ElapsedMilliseconds.Should().BeLessThan(500,
            $"demand endpoint must stay under 500 ms at 50k orders with compare=true (measured: {sw.ElapsedMilliseconds} ms)");
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private async Task<(Guid fleetId, Guid adminId)> SeedFleetAsync(CancellationToken ct)
    {
        var fleetId = Guid.CreateVersion7();
        var adminId = Guid.CreateVersion7();
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.Fleets.Add(new Fleet
        {
            Id = fleetId,
            Slug = $"dem-{Guid.NewGuid():N}",
            Name = "Demand Fleet",
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
            Email = $"admin-dem-{adminId:N}@analytics.local",
            Phone = $"+42077{Guid.NewGuid().ToString("N")[..7]}",
            DisplayName = "Demand Admin",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync(ct);
        return (fleetId, adminId);
    }

    /// <summary>Seeds a driver and returns (driverId, userId) so callers can use both for FK references.</summary>
    private async Task<(Guid driverId, Guid userId)> SeedDriverAsync(Guid fleetId, string tag, CancellationToken ct)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var userId = Guid.CreateVersion7();
        var driverId = Guid.CreateVersion7();
        db.Users.Add(new User
        {
            Id = userId,
            FleetId = fleetId,
            Role = UserRole.Driver,
            Email = $"drv-dem-{driverId:N}@analytics.local",
            Phone = $"+42078{Guid.NewGuid().ToString("N")[..7]}",
            DisplayName = $"Driver {tag}",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        });
        db.Drivers.Add(new Driver
        {
            Id = driverId,
            FleetId = fleetId,
            UserId = userId,
            Status = DriverStatus.Offline,
            IsActive = true
        });
        await db.SaveChangesAsync(ct);
        return (driverId, userId);
    }

    /// <summary>Seeds a customer user (null FleetId) and returns the user ID.</summary>
    private async Task<Guid> SeedCustomerAsync(CancellationToken ct)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var id = Guid.CreateVersion7();
        db.Users.Add(new User
        {
            Id = id,
            FleetId = null,
            Role = UserRole.Customer,
            Email = $"cust-dem-{id:N}@analytics.local",
            Phone = $"+42079{Guid.NewGuid().ToString("N")[..7]}",
            DisplayName = "Customer",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync(ct);
        return id;
    }

    /// <summary>Seeds a dispatcher user and returns the user ID for actor FK references.</summary>
    private async Task<Guid> SeedDispatcherAsync(Guid fleetId, CancellationToken ct)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var userId = Guid.CreateVersion7();
        db.Users.Add(new User
        {
            Id = userId,
            FleetId = fleetId,
            Role = UserRole.Dispatcher,
            Email = $"disp-dem-{userId:N}@analytics.local",
            Phone = $"+42070{Guid.NewGuid().ToString("N")[..7]}",
            DisplayName = "Dispatcher",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync(ct);
        return userId;
    }

    private async Task SeedShiftAsync(
        Guid fleetId, Guid driverId, DateTimeOffset startedAt, DateTimeOffset endedAt, CancellationToken ct)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var vehicleId = Guid.CreateVersion7();
        db.Vehicles.Add(new Vehicle
        {
            Id = vehicleId,
            FleetId = fleetId,
            Plate = $"DEM{Guid.NewGuid().ToString("N")[..4]}",
            Make = "Skoda",
            Model = "Octavia",
            Color = "White",
            Seats = 4,
            IsActive = true
        });
        db.DriverShifts.Add(new DriverShift
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleetId,
            DriverId = driverId,
            VehicleId = vehicleId,
            StartedAt = startedAt,
            EndedAt = endedAt
        });
        await db.SaveChangesAsync(ct);
    }

    private async Task<Guid> SeedOrderAsync(
        Guid fleetId,
        OrderStatus status,
        int finalPriceCzk,
        Guid? driverId,
        Guid? customerUserId,
        DateTimeOffset createdAt,
        double pickupLat = 50.08,
        double pickupLng = 14.43,
        DateTimeOffset? acceptedAt = null,
        DateTimeOffset? completedAt = null,
        CancellationToken ct = default)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var orderId = Guid.CreateVersion7();
        db.Orders.Add(new Order
        {
            Id = orderId,
            FleetId = fleetId,
            PublicCode = Guid.NewGuid().ToString("N")[..6].ToUpperInvariant(),
            Status = status,
            Source = OrderSource.App,
            CustomerPhone = "+420777100900",
            CustomerUserId = customerUserId,
            PickupAddress = "Pickup St",
            PickupLat = pickupLat,
            PickupLng = pickupLng,
            DropoffAddress = "Dropoff St",
            Passengers = 1,
            PriceType = PriceType.Estimate,
            DriverId = driverId,
            FinalPriceCzk = finalPriceCzk > 0 ? finalPriceCzk : null,
            PaymentType = PaymentType.Cash,
            CreatedAt = createdAt,
            AcceptedAt = acceptedAt,
            CompletedAt = completedAt ?? (status == OrderStatus.Completed ? createdAt.AddMinutes(25) : null),
            CancelledAt = status == OrderStatus.Cancelled ? createdAt.AddMinutes(5) : null,
            UpdatedAt = createdAt,
            Version = 1
        });
        await db.SaveChangesAsync(ct);
        return orderId;
    }

    private async Task SeedOrderEventAsync(
        Guid fleetId,
        Guid orderId,
        OrderEventType type,
        OrderStatus fromStatus,
        OrderStatus toStatus,
        Guid? actorUserId,
        DateTimeOffset at,
        CancellationToken ct)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.OrderEvents.Add(new OrderEvent
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleetId,
            OrderId = orderId,
            Type = type,
            FromStatus = fromStatus,
            ToStatus = toStatus,
            ActorUserId = actorUserId,
            ActorRole = UserRole.Driver,
            Payload = null,
            At = at
        });
        await db.SaveChangesAsync(ct);
    }

    private async Task<Guid> SeedZoneAsync(
        Guid fleetId,
        string name,
        ZoneShape shape,
        double centerLat,
        double centerLng,
        double? radiusMeters,
        string? polygon,
        CancellationToken ct)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var zoneId = Guid.CreateVersion7();
        db.Zones.Add(new Zone
        {
            Id = zoneId,
            FleetId = fleetId,
            Name = name,
            Shape = shape,
            CenterLat = centerLat,
            CenterLng = centerLng,
            RadiusMeters = radiusMeters,
            Polygon = polygon is not null
                ? JsonDocument.Parse(polygon)
                : null,
            IsEnabled = true
        });
        await db.SaveChangesAsync(ct);
        return zoneId;
    }

    // ── Local response DTOs (mirrors actual response shape) ───────────────────

    private sealed record GetDemandResponseDto(
        List<HeatmapCellDto> Heatmap,
        List<SupplyDemandBucketDto> SupplyDemand,
        List<UnmetDemandBucketDto> UnmetDemand,
        UtilizationDto Utilization,
        List<ZonePickupDto> ZonePickups,
        List<TopRouteDto> TopRoutes,
        GetDemandPriorDto? Prior = null);

    private sealed record GetDemandPriorDto(
        List<HeatmapCellDto> Heatmap,
        List<SupplyDemandBucketDto> SupplyDemand,
        List<UnmetDemandBucketDto> UnmetDemand,
        UtilizationDto Utilization,
        List<ZonePickupDto> ZonePickups,
        List<TopRouteDto> TopRoutes);

    private sealed record HeatmapCellDto(int Hour, int Dow, int Count);

    private sealed record SupplyDemandBucketDto(
        int Hour,
        int OrdersCreated,
        int OnlineSeconds,
        double FulfillmentRate);

    private sealed record UnmetDemandBucketDto(int Hour, int UnmetCount);

    private sealed record UtilizationDto(
        double FleetUtilization,
        List<DriverUtilizationDto> PerDriver);

    private sealed record DriverUtilizationDto(
        Guid DriverId,
        int BusySeconds,
        int OnlineSeconds,
        double Utilization);

    private sealed record ZonePickupDto(Guid ZoneId, string ZoneName, int PickupCount);

    private sealed record TopRouteDto(
        string PickupAddress,
        string DropoffAddress,
        int Count);
}

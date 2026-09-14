using System.Diagnostics;
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Infrastructure.Seed;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Analytics;

/// <summary>Integration tests for GET /api/v1/analytics/operations (WI-06):
/// SLA percentile series, offer funnel, lifecycle conversion funnel,
/// cancellation breakdown, tenant isolation, perf &lt;500 ms @ 50k.</summary>
[Collection(TestCollections.Database)]
public sealed class GetOperationsTests(PostgresFixture fixture)
{
    // All fixture orders fall on 2026-09-10 in Prague time (UTC+2 in September).
    // 2026-09-10T06:00 UTC = 2026-09-10T08:00 Prague (DOW=4 Thursday, hour=8 Prague local).
    private static readonly DateTimeOffset Sep10UtcBase = new(2026, 9, 10, 6, 0, 0, TimeSpan.Zero);

    // ── Happy path — hand-computed SLA fixture ────────────────────────────────

    /// <summary>Seeds orders with known interval durations and verifies that
    /// p50 and p90 match hand-computed values for time-to-assign (4 samples = even)
    /// and time-to-accept (3 samples = odd).
    /// <para>Fixture:
    ///   - 4 completed orders: time-to-assign durations [60, 120, 180, 240] seconds.
    ///     p50 = 150.0 (even count: interpolated between 120 and 180).
    ///     p90 = 222.0 (rn=2.7, interp between 180 and 240).
    ///   - 3 completed orders: time-to-accept durations [60, 120, 180] seconds (odd count).
    ///     p50 = 120.0 (3rd value is middle: idx=1.0, k=1, row[1]=120).
    ///     p90 = 168.0 (rn=0.9*2=1.8, k=1, row[1]=120, row[2]=180, 120+0.8*60=168).
    ///   - 1 order with null assigned_at → excluded from time-to-assign count.
    /// </para></summary>
    [Fact]
    public async Task HandleAsync_HandComputedFixture_MatchesP50P90()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, adminId) = await SeedFleetAsync(ct);

        var baseTime = Sep10UtcBase;

        // 4 orders with known time-to-assign durations (even sample count).
        // Also seed accepted_at to fill time-to-accept for some of them.
        // Orders 0-3: created at baseTime+i*hours, assigned i*60s later.
        // Orders 0-2: also have accepted_at at assigned+[60,120,180]s (3 samples, odd).
        // Orders 0-2: also have arrived_at at accepted+300s (constant, so SLA time-to-pickup all=300).
        // Orders 0-2: also have started_at and completed_at at arrived+[600,1200,1800]s.
        var durations = new[] { 60, 120, 180, 240 };
        for (var i = 0; i < 4; i++)
        {
            var created = baseTime.AddHours(i);
            var assigned = created.AddSeconds(durations[i]);
            DateTimeOffset? accepted = i < 3 ? assigned.AddSeconds(durations[i]) : null;
            DateTimeOffset? arrived = accepted.HasValue ? accepted.Value.AddSeconds(300) : null;
            DateTimeOffset? started = arrived.HasValue ? arrived.Value.AddSeconds(durations[i] * 10) : null;
            DateTimeOffset? completed = started.HasValue ? started.Value.AddMinutes(1) : null;

            await SeedOrderAsync(fleetId, OrderStatus.Completed,
                createdAt: created,
                assignedAt: assigned,
                acceptedAt: accepted,
                arrivedAt: arrived,
                startedAt: started,
                completedAt: completed,
                ct: ct);
        }

        // 1 order with null assigned_at — must be excluded from time-to-assign.
        await SeedOrderAsync(fleetId, OrderStatus.New,
            createdAt: baseTime.AddHours(10),
            assignedAt: null,
            ct: ct);

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminId);
        var resp = await client.GetAsync(
            "/api/v1/analytics/operations?from=2026-09-10&to=2026-09-11", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<GetOperationsResponseDto>(ct);

        body.Should().NotBeNull();

        // Time-to-assign: 4 samples [60,120,180,240], p50=150.0, p90=222.0.
        body!.Sla.TimeToAssign.Should().NotBeNull("time-to-assign must be computed from 4 samples");
        body.Sla.TimeToAssign!.SampleCount.Should().Be(4);
        body.Sla.TimeToAssign.Median.Should().BeApproximately(150.0, 0.5);
        body.Sla.TimeToAssign.P90.Should().BeApproximately(222.0, 0.5);

        // Time-to-accept: 3 samples [60,120,180], p50=120.0, p90=168.0.
        body.Sla.TimeToAccept.Should().NotBeNull("time-to-accept must be computed from 3 samples");
        body.Sla.TimeToAccept!.SampleCount.Should().Be(3);
        body.Sla.TimeToAccept.Median.Should().BeApproximately(120.0, 0.5);
        body.Sla.TimeToAccept.P90.Should().BeApproximately(168.0, 0.5);
    }

    // ── Offer funnel — counts Reassigned and Timeout events ───────────────────

    /// <summary>Offer funnel counts: Assigned+Reassigned = offers made, Accepted, Declined, Timeout.
    /// Seeds 2 Assigned events, 1 Reassigned, 1 Accepted, 1 Declined, 1 Timeout.
    /// Expects: OffersMade=3, Accepted=1, Declined=1, Timeouts=1.
    /// Also seeds 1 completed order for avg-offers-per-completed-ride.</summary>
    [Fact]
    public async Task HandleAsync_OfferFunnel_CountsReassignAndTimeout()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, adminId) = await SeedFleetAsync(ct);
        var (_, driverUserId) = await SeedDriverAsync(fleetId, "A", ct);
        var dispatcherId = await SeedDispatcherAsync(fleetId, ct);

        // Seed 2 orders — order1 goes through a full decline-then-timeout sequence.
        var orderId1 = await SeedOrderAsync(fleetId, OrderStatus.Completed,
            createdAt: Sep10UtcBase,
            completedAt: Sep10UtcBase.AddMinutes(30),
            ct: ct);
        var orderId2 = await SeedOrderAsync(fleetId, OrderStatus.New,
            createdAt: Sep10UtcBase,
            ct: ct);

        // Funnel events for order1:
        await SeedOrderEventAsync(fleetId, orderId1, OrderEventType.Assigned,
            OrderStatus.New, OrderStatus.Assigned, dispatcherId, Sep10UtcBase.AddMinutes(1), ct);
        await SeedOrderEventAsync(fleetId, orderId1, OrderEventType.Declined,
            OrderStatus.Assigned, OrderStatus.New, driverUserId, Sep10UtcBase.AddMinutes(2), ct);
        await SeedOrderEventAsync(fleetId, orderId1, OrderEventType.Reassigned,
            OrderStatus.New, OrderStatus.Assigned, dispatcherId, Sep10UtcBase.AddMinutes(3), ct);
        await SeedOrderEventAsync(fleetId, orderId1, OrderEventType.Timeout,
            OrderStatus.Assigned, OrderStatus.New, dispatcherId, Sep10UtcBase.AddMinutes(4), ct);
        await SeedOrderEventAsync(fleetId, orderId1, OrderEventType.Accepted,
            OrderStatus.Assigned, OrderStatus.Accepted, driverUserId, Sep10UtcBase.AddMinutes(5), ct);

        // 1 more Assigned event for order2 (counts as another offer made):
        await SeedOrderEventAsync(fleetId, orderId2, OrderEventType.Assigned,
            OrderStatus.New, OrderStatus.Assigned, dispatcherId, Sep10UtcBase.AddMinutes(1), ct);

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminId);
        var resp = await client.GetAsync(
            "/api/v1/analytics/operations?from=2026-09-10&to=2026-09-11", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<GetOperationsResponseDto>(ct);

        body.Should().NotBeNull();
        // OffersMade = Assigned(2) + Reassigned(1) = 3
        body!.OfferFunnel.OffersMade.Should().Be(3, "2 Assigned + 1 Reassigned = 3 offers made");
        body.OfferFunnel.Accepted.Should().Be(1, "1 Accepted event");
        body.OfferFunnel.Declined.Should().Be(1, "1 Declined event");
        body.OfferFunnel.Timeouts.Should().Be(1, "1 Timeout event");
        // 1 completed ride, 2 offers for that ride (Assigned + Reassigned but both for order1 which is completed).
        body.OfferFunnel.AvgOffersPerCompleted.Should().BeApproximately(2.0, 0.01,
            "1 completed ride with 2 offer events (Assigned + Reassigned)");
    }

    // ── Cancellation breakdown ────────────────────────────────────────────────

    /// <summary>Cancellation breakdown: by role (Driver/Dispatcher/Customer), by status-at-cancel,
    /// and by Prague hour-of-day. No-show share = cancelled after Arrived.</summary>
    [Fact]
    public async Task HandleAsync_CancellationBreakdown_SplitsByRoleAndStage()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, adminId) = await SeedFleetAsync(ct);
        var dispatcherId = await SeedDispatcherAsync(fleetId, ct);
        var (_, driverUserId) = await SeedDriverAsync(fleetId, "D", ct);

        // Order 1: cancelled by Dispatcher, from Assigned status (not after Arrived → not a no-show).
        var orderId1 = await SeedOrderAsync(fleetId, OrderStatus.Cancelled,
            createdAt: Sep10UtcBase,
            cancelledByRole: UserRole.Dispatcher,
            ct: ct);
        await SeedOrderEventAsync(fleetId, orderId1, OrderEventType.Cancelled,
            OrderStatus.Assigned, OrderStatus.Cancelled, dispatcherId, Sep10UtcBase.AddMinutes(2), ct);

        // Order 2: cancelled by Driver, from Accepted status → not a no-show.
        var orderId2 = await SeedOrderAsync(fleetId, OrderStatus.Cancelled,
            createdAt: Sep10UtcBase,
            cancelledByRole: UserRole.Driver,
            ct: ct);
        await SeedOrderEventAsync(fleetId, orderId2, OrderEventType.Cancelled,
            OrderStatus.Accepted, OrderStatus.Cancelled, driverUserId, Sep10UtcBase.AddMinutes(3), ct);

        // Order 3: cancelled after Arrived (no-show). CancelledByRole = Customer.
        var orderId3 = await SeedOrderAsync(fleetId, OrderStatus.Cancelled,
            createdAt: Sep10UtcBase,
            cancelledByRole: UserRole.Customer,
            ct: ct);
        await SeedOrderEventAsync(fleetId, orderId3, OrderEventType.Cancelled,
            OrderStatus.Arrived, OrderStatus.Cancelled, dispatcherId, Sep10UtcBase.AddMinutes(5), ct);

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminId);
        var resp = await client.GetAsync(
            "/api/v1/analytics/operations?from=2026-09-10&to=2026-09-11", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<GetOperationsResponseDto>(ct);

        body.Should().NotBeNull();

        // By role: Dispatcher=1, Driver=1, Customer=1.
        var byDispatcher = body!.Cancellations.ByRole.FirstOrDefault(r => r.Role == "Dispatcher");
        byDispatcher.Should().NotBeNull("1 cancellation by Dispatcher");
        byDispatcher!.Count.Should().Be(1);

        var byDriver = body.Cancellations.ByRole.FirstOrDefault(r => r.Role == "Driver");
        byDriver.Should().NotBeNull("1 cancellation by Driver");
        byDriver!.Count.Should().Be(1);

        var byCustomer = body.Cancellations.ByRole.FirstOrDefault(r => r.Role == "Customer");
        byCustomer.Should().NotBeNull("1 cancellation by Customer");
        byCustomer!.Count.Should().Be(1);

        // No-show share: 1 of 3 cancelled after Arrived.
        body.Cancellations.NoShowShare.Should().BeApproximately(1.0 / 3.0, 0.01,
            "1 of 3 cancellations happened after Arrived status");

        // By status-at-cancel: Assigned=1, Accepted=1, Arrived=1 (from FromStatus on Cancelled event).
        var atAssigned = body.Cancellations.ByStatusAtCancel.FirstOrDefault(r => r.Status == "Assigned");
        atAssigned.Should().NotBeNull("1 cancellation from Assigned status");
        atAssigned!.Count.Should().Be(1);

        var atArrived = body.Cancellations.ByStatusAtCancel.FirstOrDefault(r => r.Status == "Arrived");
        atArrived.Should().NotBeNull("1 cancellation from Arrived status (no-show)");
        atArrived!.Count.Should().Be(1);
    }

    // ── Tenant isolation ──────────────────────────────────────────────────────

    /// <summary>Fleet A admin cannot see fleet B's operations data.</summary>
    [Fact]
    public async Task HandleAsync_FleetAScopedFromFleetB_ReturnsOnlyOwnData()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetA, adminA) = await SeedFleetAsync(ct);
        var (fleetB, _) = await SeedFleetAsync(ct);

        // Fleet A: 1 completed order with known time-to-assign.
        await SeedOrderAsync(fleetA, OrderStatus.Completed,
            createdAt: Sep10UtcBase,
            assignedAt: Sep10UtcBase.AddMinutes(2),
            ct: ct);

        // Fleet B: 5 completed orders with different time-to-assign.
        for (var i = 0; i < 5; i++)
        {
            await SeedOrderAsync(fleetB, OrderStatus.Completed,
                createdAt: Sep10UtcBase,
                assignedAt: Sep10UtcBase.AddMinutes(10),
                ct: ct);
        }

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetA, adminA);
        var resp = await client.GetAsync(
            "/api/v1/analytics/operations?from=2026-09-10&to=2026-09-11", ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<GetOperationsResponseDto>(ct);

        body.Should().NotBeNull();
        // Fleet A has 1 order with 2 min assign time; fleet B's 5 orders have 10 min.
        // If isolation fails, Median would include fleet B's data.
        body!.Sla.TimeToAssign.Should().NotBeNull();
        body.Sla.TimeToAssign!.SampleCount.Should().Be(1, "only fleet A's 1 order counted");
        body.Sla.TimeToAssign.Median.Should().BeApproximately(120.0, 1.0,
            "fleet A's only order has 2-minute (120s) time-to-assign");

        // Lifecycle: only fleet A's order counts.
        body.Lifecycle.Completed.Should().Be(1, "only fleet A's 1 order is in completed count");
    }

    // ── Perf — 50k seed under 500 ms (opt-in) ────────────────────────────────

    /// <summary>AC perf: GET /operations must respond under 500 ms against 50 000 seeded orders,
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
        var url = $"/api/v1/analytics/operations?from={today.AddDays(-90):yyyy-MM-dd}&to={today:yyyy-MM-dd}&compare=true";

        // Warm-up — absorbs EF query compilation.
        (await client.GetAsync(url, ct)).EnsureSuccessStatusCode();

        var sw = Stopwatch.StartNew();
        var resp = await client.GetAsync(url, ct);
        sw.Stop();

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        sw.ElapsedMilliseconds.Should().BeLessThan(500,
            $"operations endpoint must stay under 500 ms at 50k orders with compare=true (measured: {sw.ElapsedMilliseconds} ms)");
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
            Slug = $"ops-{Guid.NewGuid():N}",
            Name = "Operations Fleet",
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
            Email = $"admin-ops-{adminId:N}@analytics.local",
            Phone = $"+42077{Guid.NewGuid().ToString("N")[..7]}",
            DisplayName = "Operations Admin",
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
            Email = $"drv-ops-{driverId:N}@analytics.local",
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
            Email = $"disp-ops-{userId:N}@analytics.local",
            Phone = $"+42070{Guid.NewGuid().ToString("N")[..7]}",
            DisplayName = "Dispatcher",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync(ct);
        return userId;
    }

    private async Task<Guid> SeedOrderAsync(
        Guid fleetId,
        OrderStatus status,
        DateTimeOffset? createdAt = null,
        DateTimeOffset? assignedAt = null,
        DateTimeOffset? acceptedAt = null,
        DateTimeOffset? arrivedAt = null,
        DateTimeOffset? startedAt = null,
        DateTimeOffset? completedAt = null,
        DateTimeOffset? cancelledAt = null,
        UserRole? cancelledByRole = null,
        CancellationToken ct = default)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var orderId = Guid.CreateVersion7();
        var created = createdAt ?? Sep10UtcBase;
        db.Orders.Add(new Order
        {
            Id = orderId,
            FleetId = fleetId,
            PublicCode = Guid.NewGuid().ToString("N")[..6].ToUpperInvariant(),
            Status = status,
            Source = OrderSource.Dispatcher,
            CustomerPhone = $"+420{Guid.NewGuid().ToString("N")[..9]}",
            PickupAddress = "Ops Test St",
            PickupLat = 50.08,
            PickupLng = 14.43,
            PriceType = PriceType.Meter,
            CreatedAt = created,
            AssignedAt = assignedAt,
            AcceptedAt = acceptedAt,
            ArrivedAt = arrivedAt,
            StartedAt = startedAt,
            CompletedAt = completedAt,
            CancelledAt = cancelledAt ?? (status == OrderStatus.Cancelled ? created.AddMinutes(5) : null),
            CancelledByRole = cancelledByRole,
            UpdatedAt = created,
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
            ActorRole = UserRole.Dispatcher,
            Payload = null,
            At = at
        });
        await db.SaveChangesAsync(ct);
    }

    // ── Local response DTOs (mirrors actual response shape) ───────────────────

    private sealed record GetOperationsResponseDto(
        OperationsSlaDto Sla,
        OfferFunnelDto OfferFunnel,
        LifecycleFunnelDto Lifecycle,
        CancellationBreakdownDto Cancellations,
        GetOperationsPriorDto? Prior = null);

    private sealed record GetOperationsPriorDto(
        OperationsSlaDto Sla,
        OfferFunnelDto OfferFunnel,
        LifecycleFunnelDto Lifecycle,
        CancellationBreakdownDto Cancellations);

    private sealed record OperationsSlaDto(
        SlaPercentileDto? TimeToAssign,
        SlaPercentileDto? TimeToAccept,
        SlaPercentileDto? TimeToPickup,
        SlaPercentileDto? RideDuration);

    private sealed record SlaPercentileDto(double Median, double P90, int SampleCount);

    private sealed record OfferFunnelDto(
        int OffersMade,
        int Accepted,
        int Declined,
        int Timeouts,
        double AvgOffersPerCompleted);

    private sealed record LifecycleFunnelDto(
        int Created,
        int Assigned,
        int Accepted,
        int Arrived,
        int InProgress,
        int Completed);

    private sealed record CancellationBreakdownDto(
        List<CancellationByRoleDto> ByRole,
        List<CancellationByStatusDto> ByStatusAtCancel,
        List<CancellationByHourDto> ByHour,
        double NoShowShare);

    private sealed record CancellationByRoleDto(string Role, int Count);

    private sealed record CancellationByStatusDto(string Status, int Count);

    private sealed record CancellationByHourDto(int Hour, int Count);
}

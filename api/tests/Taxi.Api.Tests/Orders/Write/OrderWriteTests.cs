using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Common.Orders;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Features.Orders.CreateOrder;
using Taxi.Api.Features.Orders.GetOrder;
using Taxi.Api.Features.Orders.ListOrders;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Orders.Write;

/// <summary>Integration and unit tests for create/list/detail order endpoints (WI-08).</summary>
[Collection(TestCollections.Database)]
public sealed class OrderWriteTests(PostgresFixture fixture)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        Converters = { new System.Text.Json.Serialization.JsonStringEnumConverter() }
    };

    // ── Seed helpers ──────────────────────────────────────────────────────────

    private static Fleet BuildFleet(string slugSuffix) => new()
    {
        Id = Guid.CreateVersion7(),
        Slug = $"ord-{slugSuffix}",
        Name = $"Order Test Fleet {slugSuffix}",
        Phone = "+420600800001",
        Currency = "CZK",
        TimeZone = "Europe/Prague",
        IsActive = true,
        CreatedAt = DateTimeOffset.UtcNow
    };

    private static User BuildDispatcher(Guid fleetId, string phoneSuffix) => new()
    {
        Id = Guid.CreateVersion7(),
        FleetId = fleetId,
        Role = UserRole.Dispatcher,
        Phone = $"+420600{phoneSuffix}",
        DisplayName = "Test Dispatcher",
        IsActive = true,
        CreatedAt = DateTimeOffset.UtcNow
    };

    private static User BuildCustomerUser(string phoneSuffix) => new()
    {
        Id = Guid.CreateVersion7(),
        FleetId = null,
        Role = UserRole.Customer,
        Phone = $"+420700{phoneSuffix}",
        DisplayName = "Test Customer",
        IsActive = true,
        CreatedAt = DateTimeOffset.UtcNow
    };

    private static User BuildDriverUser(Guid fleetId, string phoneSuffix) => new()
    {
        Id = Guid.CreateVersion7(),
        FleetId = fleetId,
        Role = UserRole.Driver,
        Phone = $"+420800{phoneSuffix}",
        DisplayName = "Test Driver",
        IsActive = true,
        CreatedAt = DateTimeOffset.UtcNow
    };

    private static Driver BuildDriver(Guid fleetId, Guid userId) => new()
    {
        Id = Guid.CreateVersion7(),
        FleetId = fleetId,
        UserId = userId,
        Status = DriverStatus.Free,
        IsActive = true
    };

    /// <summary>Seeds a fleet + dispatcher user and returns both (raw DbContext, no tenant). </summary>
    private async Task<(Fleet fleet, User dispatcher)> SeedFleetAndDispatcher(string suffix)
    {
        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        var fleet = BuildFleet(suffix);
        var dispatcher = BuildDispatcher(fleet.Id, $"0{suffix[..5]}");

        db.Fleets.Add(fleet);
        db.Users.Add(dispatcher);
        await db.SaveChangesAsync(TestContext.Current.CancellationToken);

        return (fleet, dispatcher);
    }

    private static CreateOrderRequest ValidDispatcherOrderRequest(string phone = "+420600000001") => new()
    {
        PickupAddress = "Václavské náměstí 1",
        PickupLat = 50.0808,
        PickupLng = 14.4282,
        DropoffAddress = "Náměstí Míru 1",
        DropoffLat = 50.0751,
        DropoffLng = 14.4379,
        CustomerPhone = phone,
        CustomerName = "Test Customer",
        Passengers = 2,
        PriceType = PriceType.Estimate,
        EstimatedPriceCzk = 200
    };

    // ── Test 1 (RED → GREEN): Dispatcher creates order → 201 + persisted + Created event ─────────

    /// <summary>Verifies that a dispatcher can create an order and it persists with a Created event.</summary>
    [Fact]
    public async Task CreateOrder_DispatcherValidRequest_Returns201AndPersistsOrderWithCreatedEvent()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var (fleet, dispatcher) = await SeedFleetAndDispatcher(suffix);

        var client = fixture.Factory.CreateClient();
        client.AsDispatcher(fleet.Id, dispatcher.Id);

        var response = await client.PostAsJsonAsync(
            "api/v1/orders",
            ValidDispatcherOrderRequest(),
            ct);

        response.StatusCode.Should().Be(HttpStatusCode.Created);

        var body = await response.Content.ReadFromJsonAsync<CreateOrderResponse>(JsonOptions, ct);
        body.Should().NotBeNull();
        body!.Order.Should().NotBeNull();
        body.Order.Status.Should().Be("New");
        body.Order.PublicCode.Should().HaveLength(6);

        // Verify persisted in DB.
        using var scope = fixture.Factory.Services.CreateScope();
        var tenant = scope.ServiceProvider.GetRequiredService<CurrentTenant>();
        tenant.FleetId = fleet.Id;
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        var order = await db.Orders.AsNoTracking().FirstOrDefaultAsync(o => o.Id == body.Order.Id, ct);
        order.Should().NotBeNull();
        order!.Status.Should().Be(OrderStatus.New);
        order.PublicCode.Should().HaveLength(6);

        var events = await db.OrderEvents.AsNoTracking()
            .Where(e => e.OrderId == order.Id)
            .ToListAsync(ct);
        events.Should().ContainSingle(e => e.Type == OrderEventType.Created);
    }

    // ── Test 2: Customer creates order via X-Fleet-Slug header ───────────────

    /// <summary>Verifies that a customer with no fleet_id JWT claim can create an order
    /// via the X-Fleet-Slug header (proves header-based tenant resolution).</summary>
    [Fact]
    public async Task CreateOrder_ValidCustomerRequest_Returns201()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];

        // Seed fleet.
        using var seedScope = fixture.Factory.Services.CreateScope();
        var seedDb = seedScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var fleet = BuildFleet(suffix);
        var customerUser = BuildCustomerUser($"0{suffix[..6]}");
        seedDb.Fleets.Add(fleet);
        seedDb.Users.Add(customerUser);
        await seedDb.SaveChangesAsync(ct);

        var client = fixture.Factory.CreateClient();
        // Customer JWT has NO fleet_id — tenant comes from the X-Fleet-Slug header.
        client.AsCustomer(customerUser.Id);
        client.DefaultRequestHeaders.Add("X-Fleet-Slug", fleet.Slug);

        var response = await client.PostAsJsonAsync(
            "api/v1/orders",
            new CreateOrderRequest
            {
                PickupAddress = "Náměstí T.G. Masaryka",
                PickupLat = 49.9987,
                PickupLng = 15.2877,
                Passengers = 1,
                PriceType = PriceType.Meter
            },
            ct);

        response.StatusCode.Should().Be(HttpStatusCode.Created);

        var body = await response.Content.ReadFromJsonAsync<CreateOrderResponse>(JsonOptions, ct);
        body.Should().NotBeNull();
        body!.Order.CustomerPhone.Should().Be(customerUser.Phone,
            "customer phone should default to their profile phone");
        body.Order.Source.Should().Be("App");
    }

    // ── Test 3: No tenant → 400 ──────────────────────────────────────────────

    /// <summary>Verifies that creating an order without a resolvable tenant returns 400.</summary>
    [Fact]
    public async Task CreateOrder_NoTenant_Returns400()
    {
        var ct = TestContext.Current.CancellationToken;

        var client = fixture.Factory.CreateClient();
        // Customer JWT with no fleet_id claim and no X-Fleet-Slug header.
        client.AsCustomer();

        var response = await client.PostAsJsonAsync(
            "api/v1/orders",
            new CreateOrderRequest
            {
                PickupAddress = "Some Address",
                PickupLat = 50.0,
                PickupLng = 14.0,
                Passengers = 1,
                PriceType = PriceType.Meter
            },
            ct);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    // ── Test 4: ScheduledAt in past → 400 ────────────────────────────────────

    /// <summary>Verifies that a scheduledAt timestamp in the past returns 400.
    /// Test name differs from the WI spec (CreateOrderValidator_ScheduledInPast_FailsWithCode)
    /// because the check is performed at the endpoint level (not validator) using injected TimeProvider.
    /// Documented in handoff notes.</summary>
    [Fact]
    public async Task CreateOrder_ScheduledInPast_Returns400WithCode()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var (fleet, dispatcher) = await SeedFleetAndDispatcher(suffix);

        var client = fixture.Factory.CreateClient();
        client.AsDispatcher(fleet.Id, dispatcher.Id);

        // FakeTimeProvider is pinned to 2026-09-10 12:00 UTC — use a past timestamp.
        var pastTime = new DateTimeOffset(2026, 9, 10, 11, 0, 0, TimeSpan.Zero);

        var response = await client.PostAsJsonAsync(
            "api/v1/orders",
            new CreateOrderRequest
            {
                PickupAddress = "Václavské náměstí",
                PickupLat = 50.0808,
                PickupLng = 14.4282,
                CustomerPhone = "+420600000001",
                Passengers = 1,
                PriceType = PriceType.Meter,
                ScheduledAt = pastTime
            },
            ct);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        // Verify the specific scheduledAt error is in the response body (not some other 400).
        // FastEndpoints UseProblemDetails() serializes the error message in the "reason" field;
        // the error code string does not appear in the JSON body.
        var body = await response.Content.ReadAsStringAsync(ct);
        body.Should().Contain("scheduledAt",
            "response body must reference the scheduledAt field so clients can attribute the error");
        body.Should().Contain("future",
            "response body must mention 'future' to discriminate scheduledAt errors from other 400s");
    }

    // ── Test 5: PublicCode unique per fleet ──────────────────────────────────

    /// <summary>Verifies that two orders in the same fleet get different public codes.</summary>
    [Fact]
    public async Task CreateOrder_PublicCodeUniquePerFleet()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var (fleet, dispatcher) = await SeedFleetAndDispatcher(suffix);

        var client = fixture.Factory.CreateClient();
        client.AsDispatcher(fleet.Id, dispatcher.Id);

        var resp1 = await client.PostAsJsonAsync("api/v1/orders", ValidDispatcherOrderRequest("+420600000011"), ct);
        var resp2 = await client.PostAsJsonAsync("api/v1/orders", ValidDispatcherOrderRequest("+420600000012"), ct);

        resp1.StatusCode.Should().Be(HttpStatusCode.Created);
        resp2.StatusCode.Should().Be(HttpStatusCode.Created);

        var body1 = await resp1.Content.ReadFromJsonAsync<CreateOrderResponse>(JsonOptions, ct);
        var body2 = await resp2.Content.ReadFromJsonAsync<CreateOrderResponse>(JsonOptions, ct);

        body1!.Order.PublicCode.Should().NotBe(body2!.Order.PublicCode,
            "each order should get a unique public code within the fleet (probabilistically true)");
    }

    // ── Test 6: ListOrders filter by status + search ─────────────────────────

    /// <summary>Verifies that list orders filters by status and returns paged results.</summary>
    [Fact]
    public async Task ListOrders_FiltersByStatusAndSearch_ReturnsPaged()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var (fleet, dispatcher) = await SeedFleetAndDispatcher(suffix);

        var client = fixture.Factory.CreateClient();
        client.AsDispatcher(fleet.Id, dispatcher.Id);

        // Create two orders.
        var req1 = ValidDispatcherOrderRequest("+420600000021");
        var req2 = new CreateOrderRequest
        {
            PickupAddress = "Náměstí Míru",
            PickupLat = 50.0751,
            PickupLng = 14.4379,
            CustomerPhone = "+420600000022",
            CustomerName = "Unique Search Name",
            Passengers = 1,
            PriceType = PriceType.Meter
        };

        await client.PostAsJsonAsync("api/v1/orders", req1, ct);
        await client.PostAsJsonAsync("api/v1/orders", req2, ct);

        // List all orders for this fleet — should find at least 2.
        var listResp = await client.GetAsync("api/v1/orders?page=1&pageSize=50", ct);
        listResp.StatusCode.Should().Be(HttpStatusCode.OK);

        var list = await listResp.Content.ReadFromJsonAsync<ListOrdersResponse>(JsonOptions, ct);
        list.Should().NotBeNull();
        list!.Total.Should().BeGreaterThanOrEqualTo(2);
        list.Page.Should().Be(1);
        list.PageSize.Should().Be(50);

        // Search by customer name.
        var searchResp = await client.GetAsync("api/v1/orders?search=Unique+Search+Name", ct);
        searchResp.StatusCode.Should().Be(HttpStatusCode.OK);
        var searchList = await searchResp.Content.ReadFromJsonAsync<ListOrdersResponse>(JsonOptions, ct);
        searchList!.Items.Should().ContainSingle(o => o.CustomerName == "Unique Search Name");

        // Status filter: New orders should return at least 2 for this fleet.
        var newStatusResp = await client.GetAsync("api/v1/orders?status=New&page=1&pageSize=50", ct);
        newStatusResp.StatusCode.Should().Be(HttpStatusCode.OK);
        var newStatusList = await newStatusResp.Content.ReadFromJsonAsync<ListOrdersResponse>(JsonOptions, ct);
        newStatusList.Should().NotBeNull();
        newStatusList!.Total.Should().BeGreaterThanOrEqualTo(2,
            "both orders were created in New status");
        newStatusList.Items.Should().AllSatisfy(o => o.Status.Should().Be("New"),
            "status filter must restrict results to New only");

        // Status filter: Completed orders should return 0 for this fleet.
        var completedStatusResp = await client.GetAsync("api/v1/orders?status=Completed&page=1&pageSize=50", ct);
        completedStatusResp.StatusCode.Should().Be(HttpStatusCode.OK);
        var completedStatusList = await completedStatusResp.Content.ReadFromJsonAsync<ListOrdersResponse>(JsonOptions, ct);
        completedStatusList.Should().NotBeNull();
        completedStatusList!.Total.Should().Be(0, "no orders in Completed status exist for this fleet");
    }

    // ── Test 7: ListOrders as Driver → 403 ──────────────────────────────────

    /// <summary>Verifies that a Driver cannot access the list orders endpoint.</summary>
    [Fact]
    public async Task ListOrders_AsDriver_Returns403()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];

        using var seedScope = fixture.Factory.Services.CreateScope();
        var seedDb = seedScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var fleet = BuildFleet(suffix);
        var driverUser = BuildDriverUser(fleet.Id, $"1{suffix[..6]}");
        seedDb.Fleets.Add(fleet);
        seedDb.Users.Add(driverUser);
        await seedDb.SaveChangesAsync(ct);

        var client = fixture.Factory.CreateClient();
        client.AsDriver(fleet.Id, driverUser.Id);

        var response = await client.GetAsync("api/v1/orders", ct);
        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    // ── Test 8: GetOrder cross-tenant → 404 (no-leak) ──────────────────────

    /// <summary>AC#3: A dispatcher of fleet B cannot see an order belonging to fleet A.
    /// Returns 404 (not 403) — do not leak existence.</summary>
    [Fact]
    public async Task GetOrder_DispatcherOfFleetB_Returns404()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffixA = Guid.NewGuid().ToString("N")[..8];
        var suffixB = Guid.NewGuid().ToString("N")[..8];

        var (fleetA, dispatcherA) = await SeedFleetAndDispatcher(suffixA);
        var (fleetB, dispatcherB) = await SeedFleetAndDispatcher(suffixB);

        // Create an order in fleet A.
        var clientA = fixture.Factory.CreateClient();
        clientA.AsDispatcher(fleetA.Id, dispatcherA.Id);
        var createResp = await clientA.PostAsJsonAsync("api/v1/orders", ValidDispatcherOrderRequest(), ct);
        createResp.StatusCode.Should().Be(HttpStatusCode.Created);

        var body = await createResp.Content.ReadFromJsonAsync<CreateOrderResponse>(JsonOptions, ct);

        // Fleet B dispatcher tries to get fleet A's order.
        var clientB = fixture.Factory.CreateClient();
        clientB.AsDispatcher(fleetB.Id, dispatcherB.Id);

        var getResp = await clientB.GetAsync($"api/v1/orders/{body!.Order.Id}", ct);
        getResp.StatusCode.Should().Be(HttpStatusCode.NotFound,
            "cross-tenant access should return 404, not 403 — no-leak");
    }

    // ── Test 9: GetOrder non-assigned driver → 404 ──────────────────────────

    /// <summary>Verifies that a driver who is not assigned to an order gets 404.</summary>
    [Fact]
    public async Task GetOrder_DriverNotAssigned_Returns404()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var (fleet, dispatcher) = await SeedFleetAndDispatcher(suffix);

        // Seed an unassigned driver.
        using var seedScope = fixture.Factory.Services.CreateScope();
        var seedDb = seedScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var driverUser = BuildDriverUser(fleet.Id, $"2{suffix[..6]}");
        var driver = BuildDriver(fleet.Id, driverUser.Id);
        seedDb.Users.Add(driverUser);
        seedDb.Drivers.Add(driver);
        await seedDb.SaveChangesAsync(ct);

        // Create an order (unassigned).
        var clientDisp = fixture.Factory.CreateClient();
        clientDisp.AsDispatcher(fleet.Id, dispatcher.Id);
        var createResp = await clientDisp.PostAsJsonAsync("api/v1/orders", ValidDispatcherOrderRequest(), ct);
        createResp.StatusCode.Should().Be(HttpStatusCode.Created);

        var body = await createResp.Content.ReadFromJsonAsync<CreateOrderResponse>(JsonOptions, ct);

        // Non-assigned driver tries to get the order.
        var driverClient = fixture.Factory.CreateClient();
        driverClient.AsDriver(fleet.Id, driverUser.Id);

        var getResp = await driverClient.GetAsync($"api/v1/orders/{body!.Order.Id}", ct);
        getResp.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    // ── Test 10: GetOrder assigned driver → 200 with allowedActions ─────────

    /// <summary>Verifies that the assigned driver can see the order and gets correct allowedActions.</summary>
    [Fact]
    public async Task GetOrder_AssignedDriver_Returns200WithAllowedActions()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var (fleet, dispatcher) = await SeedFleetAndDispatcher(suffix);

        // Seed driver + vehicle.
        using var seedScope = fixture.Factory.Services.CreateScope();
        var db = seedScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var driverUser = BuildDriverUser(fleet.Id, $"3{suffix[..6]}");
        var vehicle = new Vehicle
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            Plate = $"TEST{suffix[..4].ToUpperInvariant()}",
            Make = "Skoda",
            Model = "Octavia",
            Color = "Blue",
            Seats = 4,
            IsActive = true
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

        // Create order via dispatcher.
        var dispClient = fixture.Factory.CreateClient();
        dispClient.AsDispatcher(fleet.Id, dispatcher.Id);
        var createResp = await dispClient.PostAsJsonAsync("api/v1/orders", ValidDispatcherOrderRequest(), ct);
        createResp.StatusCode.Should().Be(HttpStatusCode.Created);
        var createdOrder = await createResp.Content.ReadFromJsonAsync<CreateOrderResponse>(JsonOptions, ct);

        // Assign via OrderService directly.
        using var assignScope = fixture.Factory.Services.CreateScope();
        var assignTenant = assignScope.ServiceProvider.GetRequiredService<CurrentTenant>();
        assignTenant.FleetId = fleet.Id;
        var assignDb = assignScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var orderSvc = assignScope.ServiceProvider.GetRequiredService<OrderService>();

        var assignResult = await orderSvc.TransitionAsync(
            createdOrder!.Order.Id,
            OrderTransition.Assign,
            new Actor(dispatcher.Id, UserRole.Dispatcher),
            new AssignPayload(driver.Id, vehicle.Id),
            ct);
        assignResult.IsSuccess.Should().BeTrue("assign should succeed");

        // Driver gets their assigned order.
        var driverClient = fixture.Factory.CreateClient();
        driverClient.AsDriver(fleet.Id, driverUser.Id);

        var getResp = await driverClient.GetAsync($"api/v1/orders/{createdOrder.Order.Id}", ct);
        getResp.StatusCode.Should().Be(HttpStatusCode.OK);

        var detail = await getResp.Content.ReadFromJsonAsync<GetOrderResponse>(JsonOptions, ct);
        detail.Should().NotBeNull();
        detail!.Order.AllowedActions.Should().Contain("accept",
            "assigned driver should have 'accept' as an allowed action");
        detail.Order.AllowedActions.Should().Contain("decline",
            "assigned driver should have 'decline' as an allowed action");

        // F3: Dispatcher view of the same Assigned order — reassign/cancel present, accept absent.
        var getDispResp = await dispClient.GetAsync($"api/v1/orders/{createdOrder.Order.Id}", ct);
        getDispResp.StatusCode.Should().Be(HttpStatusCode.OK);

        var dispDetail = await getDispResp.Content.ReadFromJsonAsync<GetOrderResponse>(JsonOptions, ct);
        dispDetail.Should().NotBeNull();
        dispDetail!.Order.AllowedActions.Should().Contain("reassign",
            "dispatcher should be able to reassign an Assigned order");
        dispDetail.Order.AllowedActions.Should().Contain("cancel",
            "dispatcher should be able to cancel an Assigned order");
        dispDetail.Order.AllowedActions.Should().NotContain("accept",
            "accept is a driver-only action; dispatcher should not have it");
    }

    // ── Test 11: GetOrder customer owner → 200 ───────────────────────────────

    /// <summary>Verifies that the owning customer can see their own order.</summary>
    [Fact]
    public async Task GetOrder_CustomerOwner_Returns200()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];

        using var seedScope = fixture.Factory.Services.CreateScope();
        var seedDb = seedScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var fleet = BuildFleet(suffix);
        var customerUser = BuildCustomerUser($"1{suffix[..6]}");
        seedDb.Fleets.Add(fleet);
        seedDb.Users.Add(customerUser);
        await seedDb.SaveChangesAsync(ct);

        var client = fixture.Factory.CreateClient();
        client.AsCustomer(customerUser.Id);
        client.DefaultRequestHeaders.Add("X-Fleet-Slug", fleet.Slug);

        // Customer creates an order.
        var createResp = await client.PostAsJsonAsync(
            "api/v1/orders",
            new CreateOrderRequest
            {
                PickupAddress = "Kolín – nám. Arnošta z Pardubic",
                PickupLat = 50.0293,
                PickupLng = 15.2011,
                Passengers = 1,
                PriceType = PriceType.Meter
            },
            ct);
        createResp.StatusCode.Should().Be(HttpStatusCode.Created);

        var body = await createResp.Content.ReadFromJsonAsync<CreateOrderResponse>(JsonOptions, ct);

        // Customer retrieves their own order.
        var getResp = await client.GetAsync($"api/v1/orders/{body!.Order.Id}", ct);
        getResp.StatusCode.Should().Be(HttpStatusCode.OK);

        var detail = await getResp.Content.ReadFromJsonAsync<GetOrderResponse>(JsonOptions, ct);
        detail.Should().NotBeNull();
        detail!.Order.Id.Should().Be(body.Order.Id);
    }

    // ── Test 12: ListOrders HasFailedSms at-a-glance flag (laneA5b, UC-005 §5) ───

    /// <summary>Builds an order row for a fleet (raw DbContext, no tenant).</summary>
    private static Order BuildOrder(Guid fleetId, string codeSeed) => new()
    {
        Id = Guid.CreateVersion7(),
        FleetId = fleetId,
        PublicCode = codeSeed[..6].ToUpperInvariant(),
        Status = OrderStatus.New,
        Source = OrderSource.Phone,
        CustomerPhone = "+420600000099",
        PickupAddress = "Pickup",
        PriceType = PriceType.Meter,
        CreatedAt = DateTimeOffset.UtcNow,
        UpdatedAt = DateTimeOffset.UtcNow,
        Version = 1
    };

    private static NotificationLog BuildLog(
        Guid fleetId, Guid orderId, NotificationChannel channel, NotificationStatus status) => new()
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleetId,
            Event = NotificationEvent.DriverArrived,
            OrderId = orderId,
            Channel = channel,
            Recipient = "+420600000099",
            Status = status,
            CreatedAt = DateTimeOffset.UtcNow
        };

    /// <summary>UC-005 §5 Visibility: the order LIST item carries HasFailedSms so the board can show
    /// the red icon at a glance. True only when the order has a failed SMS log row; a Sent SMS or a
    /// failed Push does not set it; another fleet's failed SMS never leaks.</summary>
    [Fact]
    public async Task ListOrders_HasFailedSms_TrueOnlyForFailedSmsAndTenantScoped()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffixA = Guid.NewGuid().ToString("N")[..8];
        var suffixB = Guid.NewGuid().ToString("N")[..8];
        var (fleetA, dispatcherA) = await SeedFleetAndDispatcher(suffixA);
        var (fleetB, _) = await SeedFleetAndDispatcher(suffixB);

        // Fleet A orders:
        //  - failedSmsOrder: one failed SMS → HasFailedSms == true
        //  - cleanOrder:     one Sent SMS + one failed Push → HasFailedSms == false
        //  - leakOrder:      no own failed SMS, but fleet B has a failed-SMS log row pointing at it
        var failedSmsOrder = BuildOrder(fleetA.Id, $"FS{suffixA}");
        var cleanOrder = BuildOrder(fleetA.Id, $"CL{suffixA}");
        var leakOrder = BuildOrder(fleetA.Id, $"LK{suffixA}");

        using (var scope = fixture.Factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
            db.Orders.AddRange(failedSmsOrder, cleanOrder, leakOrder);
            db.NotificationLog.AddRange(
                BuildLog(fleetA.Id, failedSmsOrder.Id, NotificationChannel.Sms, NotificationStatus.Failed),
                BuildLog(fleetA.Id, cleanOrder.Id, NotificationChannel.Sms, NotificationStatus.Sent),
                BuildLog(fleetA.Id, cleanOrder.Id, NotificationChannel.Push, NotificationStatus.Failed),
                // Cross-tenant: fleet B owns a failed-SMS row referencing fleet A's leakOrder id.
                // The query filter (FleetId == dispatcher A's fleet) must exclude it.
                BuildLog(fleetB.Id, leakOrder.Id, NotificationChannel.Sms, NotificationStatus.Failed));
            await db.SaveChangesAsync(ct);
        }

        var client = fixture.Factory.CreateClient();
        client.AsDispatcher(fleetA.Id, dispatcherA.Id);

        var listResp = await client.GetAsync("api/v1/orders?page=1&pageSize=100", ct);
        listResp.StatusCode.Should().Be(HttpStatusCode.OK);

        var list = await listResp.Content.ReadFromJsonAsync<ListOrdersResponse>(JsonOptions, ct);
        list.Should().NotBeNull();

        var failed = list!.Items.Single(o => o.Id == failedSmsOrder.Id);
        failed.HasFailedSms.Should().BeTrue("a failed SMS log row for the order sets the flag");

        var clean = list.Items.Single(o => o.Id == cleanOrder.Id);
        clean.HasFailedSms.Should().BeFalse("a Sent SMS and a failed Push must not set the flag");

        var leak = list.Items.Single(o => o.Id == leakOrder.Id);
        leak.HasFailedSms.Should().BeFalse("another fleet's failed SMS must not leak across the tenant filter");
    }
}

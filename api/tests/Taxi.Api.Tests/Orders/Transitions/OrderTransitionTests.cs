using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Common.Orders;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Features.Orders.CreateOrder;
using Taxi.Api.Features.Orders.Shared;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Orders.Transitions;

/// <summary>Integration tests for order state-machine transition endpoints (WI-09).</summary>
[Collection(TestCollections.Database)]
public sealed class OrderTransitionTests(PostgresFixture fixture)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        Converters = { new System.Text.Json.Serialization.JsonStringEnumConverter() }
    };

    // ── Seed helpers ──────────────────────────────────────────────────────────

    private static Fleet BuildFleet(string slugSuffix) => new()
    {
        Id = Guid.CreateVersion7(),
        Slug = $"tr-{slugSuffix}",
        Name = $"Transition Test Fleet {slugSuffix}",
        Phone = "+420601000001",
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
        Phone = $"+420601{phoneSuffix}",
        DisplayName = "Test Dispatcher",
        IsActive = true,
        CreatedAt = DateTimeOffset.UtcNow
    };

    private static User BuildDriverUser(Guid fleetId, string phoneSuffix) => new()
    {
        Id = Guid.CreateVersion7(),
        FleetId = fleetId,
        Role = UserRole.Driver,
        Phone = $"+420602{phoneSuffix}",
        DisplayName = "Test Driver",
        IsActive = true,
        CreatedAt = DateTimeOffset.UtcNow
    };

    private static User BuildCustomerUser(string phoneSuffix) => new()
    {
        Id = Guid.CreateVersion7(),
        FleetId = null,
        Role = UserRole.Customer,
        Phone = $"+420603{phoneSuffix}",
        DisplayName = "Test Customer",
        IsActive = true,
        CreatedAt = DateTimeOffset.UtcNow
    };

    private static Driver BuildDriver(Guid fleetId, Guid userId, Guid? vehicleId = null) => new()
    {
        Id = Guid.CreateVersion7(),
        FleetId = fleetId,
        UserId = userId,
        Status = DriverStatus.Free,
        CurrentVehicleId = vehicleId,
        IsActive = true
    };

    private static Vehicle BuildVehicle(Guid fleetId) => new()
    {
        Id = Guid.CreateVersion7(),
        FleetId = fleetId,
        Plate = "TT-01",
        Make = "Skoda",
        Model = "Octavia",
        Color = "Black",
        Seats = 4,
        IsActive = true
    };

    /// <summary>Seeds a full test scenario: fleet, dispatcher, driver user, driver row, vehicle.
    /// Returns a seeded context object for use in tests.</summary>
    private async Task<SeedContext> SeedScenario(string suffix)
    {
        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        var fleet = BuildFleet(suffix);
        var dispatcherUser = BuildDispatcher(fleet.Id, $"{suffix[..5]}1");
        var driverUser = BuildDriverUser(fleet.Id, $"{suffix[..5]}2");
        var vehicle = BuildVehicle(fleet.Id);
        vehicle.Plate = $"T{suffix[..5].ToUpperInvariant()}";
        var driver = BuildDriver(fleet.Id, driverUser.Id, vehicle.Id);

        db.Fleets.Add(fleet);
        db.Users.Add(dispatcherUser);
        db.Users.Add(driverUser);
        db.Vehicles.Add(vehicle);
        db.Drivers.Add(driver);
        await db.SaveChangesAsync(TestContext.Current.CancellationToken);

        return new SeedContext(fleet, dispatcherUser, driverUser, driver, vehicle);
    }

    private async Task<Guid> CreateOrder(HttpClient client, string phone = "+420600999001")
    {
        var ct = TestContext.Current.CancellationToken;
        var response = await client.PostAsJsonAsync("api/v1/orders", new CreateOrderRequest
        {
            PickupAddress = "Test pickup",
            PickupLat = 50.0,
            PickupLng = 14.0,
            CustomerPhone = phone,
            Passengers = 1,
            PriceType = PriceType.Meter
        }, ct);
        response.StatusCode.Should().Be(HttpStatusCode.Created, "creating order should succeed");
        var body = await response.Content.ReadFromJsonAsync<CreateOrderResponse>(JsonOptions, ct);
        return body!.Order.Id;
    }

    private async Task TransitionViaService(
        Guid orderId, Guid fleetId, OrderTransition transition, Actor actor, object? payload = null)
    {
        var ct = TestContext.Current.CancellationToken;
        using var scope = fixture.Factory.Services.CreateScope();
        var tenant = scope.ServiceProvider.GetRequiredService<CurrentTenant>();
        tenant.FleetId = fleetId;
        var svc = scope.ServiceProvider.GetRequiredService<OrderService>();
        var result = await svc.TransitionAsync(orderId, transition, actor, payload, ct);
        result.IsSuccess.Should().BeTrue($"prerequisite transition {transition} should succeed");
    }

    // ── Happy path: Assign ────────────────────────────────────────────────────

    [Fact]
    public async Task Assign_ByDispatcher_Returns200AndWritesAssignedEvent()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..5];
        var ctx = await SeedScenario(suffix);

        var client = fixture.Factory.CreateClient();
        client.AsDispatcher(ctx.Fleet.Id, ctx.DispatcherUser.Id);

        var orderId = await CreateOrder(client);

        var response = await client.PostAsJsonAsync(
            $"api/v1/orders/{orderId}/assign",
            new { driverId = ctx.Driver.Id },
            ct);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<TransitionOrderResponse>(JsonOptions, ct);
        body.Should().NotBeNull();
        body!.Order.Status.Should().Be("Assigned");

        // Verify event persisted.
        using var scope = fixture.Factory.Services.CreateScope();
        var tenant = scope.ServiceProvider.GetRequiredService<CurrentTenant>();
        tenant.FleetId = ctx.Fleet.Id;
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var ev = await db.OrderEvents.AsNoTracking()
            .Where(e => e.OrderId == orderId && e.Type == OrderEventType.Assigned)
            .FirstOrDefaultAsync(ct);
        ev.Should().NotBeNull("an Assigned event must be written");
    }

    // ── Happy path: Reassign ──────────────────────────────────────────────────

    [Fact]
    public async Task Reassign_ByDispatcher_Returns200()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..5];
        var ctx = await SeedScenario(suffix);

        // Seed a second driver.
        using var seedScope = fixture.Factory.Services.CreateScope();
        var seedDb = seedScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var driver2User = BuildDriverUser(ctx.Fleet.Id, $"{suffix[..4]}3x");
        var vehicle2 = BuildVehicle(ctx.Fleet.Id);
        vehicle2.Plate = $"R{suffix[..4].ToUpperInvariant()}2";
        var driver2 = BuildDriver(ctx.Fleet.Id, driver2User.Id, vehicle2.Id);
        seedDb.Users.Add(driver2User);
        seedDb.Vehicles.Add(vehicle2);
        seedDb.Drivers.Add(driver2);
        await seedDb.SaveChangesAsync(ct);

        var client = fixture.Factory.CreateClient();
        client.AsDispatcher(ctx.Fleet.Id, ctx.DispatcherUser.Id);
        var orderId = await CreateOrder(client, "+420600999002");

        // Assign to driver1 first.
        await TransitionViaService(orderId, ctx.Fleet.Id, OrderTransition.Assign,
            new Actor(ctx.DispatcherUser.Id, UserRole.Dispatcher),
            new AssignPayload(ctx.Driver.Id, ctx.Vehicle.Id));

        // Reassign to driver2 via endpoint.
        var response = await client.PostAsJsonAsync(
            $"api/v1/orders/{orderId}/reassign",
            new { driverId = driver2.Id },
            ct);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<TransitionOrderResponse>(JsonOptions, ct);
        body!.Order.Status.Should().Be("Assigned");
    }

    // ── Happy path: Accept ────────────────────────────────────────────────────

    [Fact]
    public async Task Accept_ByAssignedDriver_Returns200()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..5];
        var ctx = await SeedScenario(suffix);

        var dispClient = fixture.Factory.CreateClient();
        dispClient.AsDispatcher(ctx.Fleet.Id, ctx.DispatcherUser.Id);
        var orderId = await CreateOrder(dispClient, "+420600999003");

        await TransitionViaService(orderId, ctx.Fleet.Id, OrderTransition.Assign,
            new Actor(ctx.DispatcherUser.Id, UserRole.Dispatcher),
            new AssignPayload(ctx.Driver.Id, ctx.Vehicle.Id));

        var driverClient = fixture.Factory.CreateClient();
        driverClient.AsDriver(ctx.Fleet.Id, ctx.DriverUser.Id);

        var response = await driverClient.PostAsJsonAsync(
            $"api/v1/orders/{orderId}/accept",
            new { },
            ct);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<TransitionOrderResponse>(JsonOptions, ct);
        body!.Order.Status.Should().Be("Accepted");
    }

    // ── Happy path: Decline ───────────────────────────────────────────────────

    [Fact]
    public async Task Decline_ByAssignedDriver_Returns200()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..5];
        var ctx = await SeedScenario(suffix);

        var dispClient = fixture.Factory.CreateClient();
        dispClient.AsDispatcher(ctx.Fleet.Id, ctx.DispatcherUser.Id);
        var orderId = await CreateOrder(dispClient, "+420600999004");

        await TransitionViaService(orderId, ctx.Fleet.Id, OrderTransition.Assign,
            new Actor(ctx.DispatcherUser.Id, UserRole.Dispatcher),
            new AssignPayload(ctx.Driver.Id, ctx.Vehicle.Id));

        var driverClient = fixture.Factory.CreateClient();
        driverClient.AsDriver(ctx.Fleet.Id, ctx.DriverUser.Id);

        var response = await driverClient.PostAsJsonAsync(
            $"api/v1/orders/{orderId}/decline",
            new { reason = "no fuel" },
            ct);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<TransitionOrderResponse>(JsonOptions, ct);
        body!.Order.Status.Should().Be("New");
    }

    // ── Happy path: Arrive ────────────────────────────────────────────────────

    [Fact]
    public async Task Arrive_ByAssignedDriver_Returns200()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..5];
        var ctx = await SeedScenario(suffix);

        var dispClient = fixture.Factory.CreateClient();
        dispClient.AsDispatcher(ctx.Fleet.Id, ctx.DispatcherUser.Id);
        var orderId = await CreateOrder(dispClient, "+420600999005");

        await TransitionViaService(orderId, ctx.Fleet.Id, OrderTransition.Assign,
            new Actor(ctx.DispatcherUser.Id, UserRole.Dispatcher),
            new AssignPayload(ctx.Driver.Id, ctx.Vehicle.Id));
        await TransitionViaService(orderId, ctx.Fleet.Id, OrderTransition.Accept,
            new Actor(ctx.DriverUser.Id, UserRole.Driver, ctx.Driver.Id));

        var driverClient = fixture.Factory.CreateClient();
        driverClient.AsDriver(ctx.Fleet.Id, ctx.DriverUser.Id);

        var response = await driverClient.PostAsJsonAsync(
            $"api/v1/orders/{orderId}/arrive",
            new { },
            ct);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<TransitionOrderResponse>(JsonOptions, ct);
        body!.Order.Status.Should().Be("Arrived");
    }

    // ── Happy path: Start ─────────────────────────────────────────────────────

    [Fact]
    public async Task Start_ByAssignedDriver_Returns200()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..5];
        var ctx = await SeedScenario(suffix);

        var dispClient = fixture.Factory.CreateClient();
        dispClient.AsDispatcher(ctx.Fleet.Id, ctx.DispatcherUser.Id);
        var orderId = await CreateOrder(dispClient, "+420600999006");

        await TransitionViaService(orderId, ctx.Fleet.Id, OrderTransition.Assign,
            new Actor(ctx.DispatcherUser.Id, UserRole.Dispatcher),
            new AssignPayload(ctx.Driver.Id, ctx.Vehicle.Id));
        await TransitionViaService(orderId, ctx.Fleet.Id, OrderTransition.Accept,
            new Actor(ctx.DriverUser.Id, UserRole.Driver, ctx.Driver.Id));
        await TransitionViaService(orderId, ctx.Fleet.Id, OrderTransition.Arrive,
            new Actor(ctx.DriverUser.Id, UserRole.Driver, ctx.Driver.Id));

        var driverClient = fixture.Factory.CreateClient();
        driverClient.AsDriver(ctx.Fleet.Id, ctx.DriverUser.Id);

        var response = await driverClient.PostAsJsonAsync(
            $"api/v1/orders/{orderId}/start",
            new { },
            ct);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<TransitionOrderResponse>(JsonOptions, ct);
        body!.Order.Status.Should().Be("InProgress");
    }

    // ── Happy path: Complete ──────────────────────────────────────────────────

    [Fact]
    public async Task Complete_ByAssignedDriver_Returns200()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..5];
        var ctx = await SeedScenario(suffix);

        var dispClient = fixture.Factory.CreateClient();
        dispClient.AsDispatcher(ctx.Fleet.Id, ctx.DispatcherUser.Id);
        var orderId = await CreateOrder(dispClient, "+420600999007");

        await TransitionViaService(orderId, ctx.Fleet.Id, OrderTransition.Assign,
            new Actor(ctx.DispatcherUser.Id, UserRole.Dispatcher),
            new AssignPayload(ctx.Driver.Id, ctx.Vehicle.Id));
        await TransitionViaService(orderId, ctx.Fleet.Id, OrderTransition.Accept,
            new Actor(ctx.DriverUser.Id, UserRole.Driver, ctx.Driver.Id));
        await TransitionViaService(orderId, ctx.Fleet.Id, OrderTransition.Arrive,
            new Actor(ctx.DriverUser.Id, UserRole.Driver, ctx.Driver.Id));
        await TransitionViaService(orderId, ctx.Fleet.Id, OrderTransition.Start,
            new Actor(ctx.DriverUser.Id, UserRole.Driver, ctx.Driver.Id));

        var driverClient = fixture.Factory.CreateClient();
        driverClient.AsDriver(ctx.Fleet.Id, ctx.DriverUser.Id);

        var response = await driverClient.PostAsJsonAsync(
            $"api/v1/orders/{orderId}/complete",
            new { finalPriceCzk = 250, paymentType = "Cash" },
            ct);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<TransitionOrderResponse>(JsonOptions, ct);
        body!.Order.Status.Should().Be("Completed");
    }

    // ── Happy path: Cancel (Dispatcher) ──────────────────────────────────────

    [Fact]
    public async Task Cancel_ByDispatcher_Returns200()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..5];
        var ctx = await SeedScenario(suffix);

        var client = fixture.Factory.CreateClient();
        client.AsDispatcher(ctx.Fleet.Id, ctx.DispatcherUser.Id);
        var orderId = await CreateOrder(client, "+420600999008");

        var response = await client.PostAsJsonAsync(
            $"api/v1/orders/{orderId}/cancel",
            new { reason = "no driver available" },
            ct);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<TransitionOrderResponse>(JsonOptions, ct);
        body!.Order.Status.Should().Be("Cancelled");
    }

    // ── NotEntitled: other driver → 404 ──────────────────────────────────────

    [Fact]
    public async Task Accept_ByOtherDriver_Returns404()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..5];
        var ctx = await SeedScenario(suffix);

        // Seed a second driver.
        using var seedScope = fixture.Factory.Services.CreateScope();
        var seedDb = seedScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var otherDriverUser = BuildDriverUser(ctx.Fleet.Id, $"{suffix[..4]}9y");
        var otherDriver = BuildDriver(ctx.Fleet.Id, otherDriverUser.Id);
        seedDb.Users.Add(otherDriverUser);
        seedDb.Drivers.Add(otherDriver);
        await seedDb.SaveChangesAsync(ct);

        var dispClient = fixture.Factory.CreateClient();
        dispClient.AsDispatcher(ctx.Fleet.Id, ctx.DispatcherUser.Id);
        var orderId = await CreateOrder(dispClient, "+420600999009");

        await TransitionViaService(orderId, ctx.Fleet.Id, OrderTransition.Assign,
            new Actor(ctx.DispatcherUser.Id, UserRole.Dispatcher),
            new AssignPayload(ctx.Driver.Id, ctx.Vehicle.Id));

        // Other driver (not assigned) tries to accept.
        var otherDriverClient = fixture.Factory.CreateClient();
        otherDriverClient.AsDriver(ctx.Fleet.Id, otherDriverUser.Id);

        var response = await otherDriverClient.PostAsJsonAsync(
            $"api/v1/orders/{orderId}/accept",
            new { },
            ct);

        response.StatusCode.Should().Be(HttpStatusCode.NotFound,
            "NotEntitled must return 404 — no-leak, not 403");
    }

    // ── IllegalTransition: wrong from-status → 409 ────────────────────────────

    [Fact]
    public async Task Transition_IllegalFromStatus_Returns409()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..5];
        var ctx = await SeedScenario(suffix);

        var dispClient = fixture.Factory.CreateClient();
        dispClient.AsDispatcher(ctx.Fleet.Id, ctx.DispatcherUser.Id);
        var orderId = await CreateOrder(dispClient, "+420600999010");

        // Drive order to InProgress — then try to cancel as Dispatcher, which is illegal from InProgress.
        await TransitionViaService(orderId, ctx.Fleet.Id, OrderTransition.Assign,
            new Actor(ctx.DispatcherUser.Id, UserRole.Dispatcher),
            new AssignPayload(ctx.Driver.Id, ctx.Vehicle.Id));
        await TransitionViaService(orderId, ctx.Fleet.Id, OrderTransition.Accept,
            new Actor(ctx.DriverUser.Id, UserRole.Driver, ctx.Driver.Id));
        await TransitionViaService(orderId, ctx.Fleet.Id, OrderTransition.Arrive,
            new Actor(ctx.DriverUser.Id, UserRole.Driver, ctx.Driver.Id));
        await TransitionViaService(orderId, ctx.Fleet.Id, OrderTransition.Start,
            new Actor(ctx.DriverUser.Id, UserRole.Driver, ctx.Driver.Id));

        // Dispatcher tries to cancel from InProgress — IllegalTransition (only Arrived or earlier).
        var response = await dispClient.PostAsJsonAsync(
            $"api/v1/orders/{orderId}/cancel",
            new { reason = "test illegal cancel" },
            ct);

        response.StatusCode.Should().Be(HttpStatusCode.Conflict,
            "Dispatcher cancel from InProgress is an IllegalTransition → 409");
    }

    // ── Cross-tenant Cancel → 404 ─────────────────────────────────────────────

    [Fact]
    public async Task Cancel_CrossTenantOrder_Returns404()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffixA = Guid.NewGuid().ToString("N")[..5];
        var suffixB = Guid.NewGuid().ToString("N")[..5];

        var ctxA = await SeedScenario(suffixA);
        var ctxB = await SeedScenario(suffixB);

        var clientA = fixture.Factory.CreateClient();
        clientA.AsDispatcher(ctxA.Fleet.Id, ctxA.DispatcherUser.Id);
        var orderId = await CreateOrder(clientA, "+420600999011");

        // Fleet B dispatcher tries to cancel fleet A's order.
        var clientB = fixture.Factory.CreateClient();
        clientB.AsDispatcher(ctxB.Fleet.Id, ctxB.DispatcherUser.Id);

        var response = await clientB.PostAsJsonAsync(
            $"api/v1/orders/{orderId}/cancel",
            new { reason = "cross-tenant attempt" },
            ct);

        response.StatusCode.Should().Be(HttpStatusCode.NotFound,
            "cross-tenant access must return 404 — no-leak");
    }

    // ── Concurrency: two dispatchers, one gets 409 ────────────────────────────

    [Fact]
    public async Task Assign_TwoDispatchersSameOrder_OneGets409()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..5];
        var ctx = await SeedScenario(suffix);

        // Seed a second dispatcher.
        using var seedScope = fixture.Factory.Services.CreateScope();
        var seedDb = seedScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var dispatcher2User = BuildDispatcher(ctx.Fleet.Id, $"{suffix[..4]}0z");
        seedDb.Users.Add(dispatcher2User);
        await seedDb.SaveChangesAsync(ct);

        var client1 = fixture.Factory.CreateClient();
        client1.AsDispatcher(ctx.Fleet.Id, ctx.DispatcherUser.Id);
        var client2 = fixture.Factory.CreateClient();
        client2.AsDispatcher(ctx.Fleet.Id, dispatcher2User.Id);

        var orderId = await CreateOrder(client1, "+420600999012");

        // Both dispatchers race to assign the same order to the same driver.
        var task1 = client1.PostAsJsonAsync(
            $"api/v1/orders/{orderId}/assign",
            new { driverId = ctx.Driver.Id },
            ct);
        var task2 = client2.PostAsJsonAsync(
            $"api/v1/orders/{orderId}/assign",
            new { driverId = ctx.Driver.Id },
            ct);

        var results = await Task.WhenAll(task1, task2);
        var statusCodes = results.Select(r => (int)r.StatusCode).OrderBy(x => x).ToList();

        statusCodes.Should().Contain(200, "exactly one dispatcher should win");
        statusCodes.Should().Contain(409, "the other dispatcher must get 409 (concurrency or illegal transition)");
        statusCodes.Count.Should().Be(2);
    }

    // ── Complete: fixed price mismatch without reason → 409 ──────────────────

    [Fact]
    public async Task Complete_FixedPriceMismatchWithoutReason_Returns409()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..5];
        var ctx = await SeedScenario(suffix);

        // Create a fixed-price order.
        var dispClient = fixture.Factory.CreateClient();
        dispClient.AsDispatcher(ctx.Fleet.Id, ctx.DispatcherUser.Id);

        var createResp = await dispClient.PostAsJsonAsync("api/v1/orders", new CreateOrderRequest
        {
            PickupAddress = "Pickup",
            PickupLat = 50.0,
            PickupLng = 14.0,
            CustomerPhone = "+420600999013",
            Passengers = 1,
            PriceType = PriceType.Fixed,
            FixedPriceCzk = 200
        }, ct);
        createResp.StatusCode.Should().Be(HttpStatusCode.Created);
        var createdOrder = await createResp.Content.ReadFromJsonAsync<CreateOrderResponse>(JsonOptions, ct);
        var orderId = createdOrder!.Order.Id;

        await TransitionViaService(orderId, ctx.Fleet.Id, OrderTransition.Assign,
            new Actor(ctx.DispatcherUser.Id, UserRole.Dispatcher),
            new AssignPayload(ctx.Driver.Id, ctx.Vehicle.Id));
        await TransitionViaService(orderId, ctx.Fleet.Id, OrderTransition.Accept,
            new Actor(ctx.DriverUser.Id, UserRole.Driver, ctx.Driver.Id));
        await TransitionViaService(orderId, ctx.Fleet.Id, OrderTransition.Arrive,
            new Actor(ctx.DriverUser.Id, UserRole.Driver, ctx.Driver.Id));
        await TransitionViaService(orderId, ctx.Fleet.Id, OrderTransition.Start,
            new Actor(ctx.DriverUser.Id, UserRole.Driver, ctx.Driver.Id));

        var driverClient = fixture.Factory.CreateClient();
        driverClient.AsDriver(ctx.Fleet.Id, ctx.DriverUser.Id);

        // Complete with a different price but no override reason.
        var response = await driverClient.PostAsJsonAsync(
            $"api/v1/orders/{orderId}/complete",
            new { finalPriceCzk = 350, paymentType = "Cash" },
            ct);

        response.StatusCode.Should().Be(HttpStatusCode.Conflict,
            "completing a fixed-price order with different price and no reason is an IllegalTransition");
    }

    // ── Validator: complete without paymentType → 400 ─────────────────────────

    [Fact]
    public async Task Complete_MissingPaymentType_Returns400()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..5];
        var ctx = await SeedScenario(suffix);

        var dispClient = fixture.Factory.CreateClient();
        dispClient.AsDispatcher(ctx.Fleet.Id, ctx.DispatcherUser.Id);
        var orderId = await CreateOrder(dispClient, "+420600999014");

        await TransitionViaService(orderId, ctx.Fleet.Id, OrderTransition.Assign,
            new Actor(ctx.DispatcherUser.Id, UserRole.Dispatcher),
            new AssignPayload(ctx.Driver.Id, ctx.Vehicle.Id));
        await TransitionViaService(orderId, ctx.Fleet.Id, OrderTransition.Accept,
            new Actor(ctx.DriverUser.Id, UserRole.Driver, ctx.Driver.Id));
        await TransitionViaService(orderId, ctx.Fleet.Id, OrderTransition.Arrive,
            new Actor(ctx.DriverUser.Id, UserRole.Driver, ctx.Driver.Id));
        await TransitionViaService(orderId, ctx.Fleet.Id, OrderTransition.Start,
            new Actor(ctx.DriverUser.Id, UserRole.Driver, ctx.Driver.Id));

        var driverClient = fixture.Factory.CreateClient();
        driverClient.AsDriver(ctx.Fleet.Id, ctx.DriverUser.Id);

        // Complete without paymentType (null) — validator should catch this.
        var response = await driverClient.PostAsJsonAsync(
            $"api/v1/orders/{orderId}/complete",
            new { finalPriceCzk = 250, paymentType = (string?)null },
            ct);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest,
            "missing paymentType must be caught by the CompleteOrder validator");
    }

    // ── Validator: decline with empty reason → 400 ───────────────────────────

    [Fact]
    public async Task Decline_EmptyReason_Returns400()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..5];
        var ctx = await SeedScenario(suffix);

        var dispClient = fixture.Factory.CreateClient();
        dispClient.AsDispatcher(ctx.Fleet.Id, ctx.DispatcherUser.Id);
        var orderId = await CreateOrder(dispClient, "+420600999015");

        await TransitionViaService(orderId, ctx.Fleet.Id, OrderTransition.Assign,
            new Actor(ctx.DispatcherUser.Id, UserRole.Dispatcher),
            new AssignPayload(ctx.Driver.Id, ctx.Vehicle.Id));

        var driverClient = fixture.Factory.CreateClient();
        driverClient.AsDriver(ctx.Fleet.Id, ctx.DriverUser.Id);

        var response = await driverClient.PostAsJsonAsync(
            $"api/v1/orders/{orderId}/decline",
            new { reason = "" },
            ct);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest,
            "empty decline reason must be caught by the DeclineOrder validator");
    }

    // ── Validator: cancel with empty reason → 400 ────────────────────────────

    [Fact]
    public async Task Cancel_EmptyReason_Returns400()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..5];
        var ctx = await SeedScenario(suffix);

        var client = fixture.Factory.CreateClient();
        client.AsDispatcher(ctx.Fleet.Id, ctx.DispatcherUser.Id);
        var orderId = await CreateOrder(client, "+420600999016");

        var response = await client.PostAsJsonAsync(
            $"api/v1/orders/{orderId}/cancel",
            new { reason = "" },
            ct);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest,
            "empty cancel reason must be caught by the CancelOrder validator");
    }

    // ── Record helper ─────────────────────────────────────────────────────────

    private sealed record SeedContext(
        Fleet Fleet,
        User DispatcherUser,
        User DriverUser,
        Driver Driver,
        Vehicle Vehicle);
}

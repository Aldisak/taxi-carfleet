using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using FluentValidation.TestHelper;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Common;
using Taxi.Api.Common.Orders;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Features.Orders.AddNote;
using Taxi.Api.Features.Orders.CreateOrder;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Orders.Tracking;

/// <summary>Integration and unit tests for order by-code tracking, notes, and events (WI-10).</summary>
[Collection(TestCollections.Database)]
public sealed class OrderTrackingTests(PostgresFixture fixture)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        Converters = { new System.Text.Json.Serialization.JsonStringEnumConverter() }
    };

    // ── Seed helpers ──────────────────────────────────────────────────────────

    private static Fleet BuildFleet(string slugSuffix) => new()
    {
        Id = Guid.CreateVersion7(),
        Slug = $"trk-{slugSuffix}",
        Name = $"Tracking Test Fleet {slugSuffix}",
        Phone = "+420605000001",
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
        Phone = $"+420605{phoneSuffix}",
        DisplayName = "Test Dispatcher",
        IsActive = true,
        CreatedAt = DateTimeOffset.UtcNow
    };

    private static User BuildCustomerUser(string phoneSuffix) => new()
    {
        Id = Guid.CreateVersion7(),
        FleetId = null,
        Role = UserRole.Customer,
        Phone = $"+420606{phoneSuffix}",
        DisplayName = "Jana Novakova",
        IsActive = true,
        CreatedAt = DateTimeOffset.UtcNow
    };

    private static User BuildDriverUser(Guid fleetId, string phoneSuffix) => new()
    {
        Id = Guid.CreateVersion7(),
        FleetId = fleetId,
        Role = UserRole.Driver,
        Phone = $"+420607{phoneSuffix}",
        DisplayName = "Tomas Horak",
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
        Plate = "TRK-001",
        Make = "Skoda",
        Model = "Superb",
        Color = "Silver",
        Seats = 4,
        IsActive = true
    };

    /// <summary>Creates an order via the API and returns its public code and id.</summary>
    private async Task<(Guid orderId, string publicCode)> CreateOrder(
        HttpClient client, string ct_str = "+420600000001")
    {
        var ct = TestContext.Current.CancellationToken;
        var response = await client.PostAsJsonAsync(
            "api/v1/orders",
            new CreateOrderRequest
            {
                PickupAddress = "Náměstí T.G. Masaryka",
                PickupLat = 49.9987,
                PickupLng = 15.2877,
                CustomerPhone = ct_str,
                Passengers = 1,
                PriceType = PriceType.Meter
            },
            ct);

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var body = await response.Content.ReadFromJsonAsync<CreateOrderResponse>(JsonOptions, ct);
        return (body!.Order.Id, body.Order.PublicCode);
    }

    // ── Test 1 (RED → GREEN): GetByCode owner returns 200 with reduced DTO ───

    /// <summary>Customer who owns the order gets a reduced DTO via by-code lookup.
    /// Sensitive fields (price, customerPhone, etc.) must NOT appear in the JSON response.</summary>
    [Fact]
    public async Task GetByCode_Owner_Returns200ReducedDto()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];

        // Seed fleet, dispatcher, customer.
        using var seedScope = fixture.Factory.Services.CreateScope();
        var seedDb = seedScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var fleet = BuildFleet(suffix);
        var dispatcher = BuildDispatcher(fleet.Id, $"0{suffix[..6]}");
        var customer = BuildCustomerUser($"0{suffix[..6]}");
        seedDb.Fleets.Add(fleet);
        seedDb.Users.Add(dispatcher);
        seedDb.Users.Add(customer);
        await seedDb.SaveChangesAsync(ct);

        // Create order as dispatcher.
        var dispClient = fixture.Factory.CreateClient();
        dispClient.AsDispatcher(fleet.Id, dispatcher.Id);
        var (orderId, publicCode) = await CreateOrder(dispClient);

        // Set order.CustomerUserId = customer.Id via direct DB to simulate customer-owned.
        using var updateScope = fixture.Factory.Services.CreateScope();
        var updateTenant = updateScope.ServiceProvider.GetRequiredService<CurrentTenant>();
        updateTenant.FleetId = fleet.Id;
        var updateDb = updateScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var order = await updateDb.Orders.FirstAsync(o => o.Id == orderId, ct);
        order.CustomerUserId = customer.Id;
        await updateDb.SaveChangesAsync(ct);

        // Customer calls by-code with X-Fleet-Slug header.
        var custClient = fixture.Factory.CreateClient();
        custClient.AsCustomer(customer.Id);
        custClient.DefaultRequestHeaders.Add("X-Fleet-Slug", fleet.Slug);

        var response = await custClient.GetAsync($"api/v1/orders/by-code/{publicCode}", ct);
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        // Assert reduced DTO fields present.
        var rawJson = await response.Content.ReadAsStringAsync(ct);
        rawJson.Should().Contain("status");
        rawJson.Should().Contain("pickupAddress");

        // Assert sensitive fields ABSENT.
        rawJson.Should().NotContain("customerPhone",
            "by-code endpoint must not expose the customer phone number");
        rawJson.Should().NotContain("Czk",
            "by-code endpoint must not expose any price field");
        rawJson.Should().NotContain("allowedActions",
            "by-code endpoint must not expose allowed actions");
    }

    // ── Test 2: GetByCode non-owner returns 404 ──────────────────────────────

    /// <summary>A customer who does not own the order gets a no-leak 404 on by-code lookup.</summary>
    [Fact]
    public async Task GetByCode_NonOwner_Returns404()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];

        using var seedScope = fixture.Factory.Services.CreateScope();
        var seedDb = seedScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var fleet = BuildFleet(suffix);
        var dispatcher = BuildDispatcher(fleet.Id, $"1{suffix[..6]}");
        var ownerCustomer = BuildCustomerUser($"1{suffix[..6]}");
        var otherCustomer = BuildCustomerUser($"2{suffix[..6]}");
        seedDb.Fleets.Add(fleet);
        seedDb.Users.Add(dispatcher);
        seedDb.Users.Add(ownerCustomer);
        seedDb.Users.Add(otherCustomer);
        await seedDb.SaveChangesAsync(ct);

        // Create order.
        var dispClient = fixture.Factory.CreateClient();
        dispClient.AsDispatcher(fleet.Id, dispatcher.Id);
        var (orderId, publicCode) = await CreateOrder(dispClient);

        // Set order owner.
        using var updateScope = fixture.Factory.Services.CreateScope();
        var updateTenant = updateScope.ServiceProvider.GetRequiredService<CurrentTenant>();
        updateTenant.FleetId = fleet.Id;
        var updateDb = updateScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var order = await updateDb.Orders.FirstAsync(o => o.Id == orderId, ct);
        order.CustomerUserId = ownerCustomer.Id;
        await updateDb.SaveChangesAsync(ct);

        // Other customer tries to read.
        var otherClient = fixture.Factory.CreateClient();
        otherClient.AsCustomer(otherCustomer.Id);
        otherClient.DefaultRequestHeaders.Add("X-Fleet-Slug", fleet.Slug);

        var response = await otherClient.GetAsync($"api/v1/orders/by-code/{publicCode}", ct);
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    // ── Test 3: GetByCode with dispatcher token returns 403 (policy) ─────────

    /// <summary>A dispatcher using the CustomerOnly endpoint gets 403 from the policy layer.</summary>
    [Fact]
    public async Task GetByCode_DispatcherToken_Returns403()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];

        using var seedScope = fixture.Factory.Services.CreateScope();
        var seedDb = seedScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var fleet = BuildFleet(suffix);
        var dispatcher = BuildDispatcher(fleet.Id, $"3{suffix[..6]}");
        seedDb.Fleets.Add(fleet);
        seedDb.Users.Add(dispatcher);
        await seedDb.SaveChangesAsync(ct);

        var dispClient = fixture.Factory.CreateClient();
        dispClient.AsDispatcher(fleet.Id, dispatcher.Id);

        var response = await dispClient.GetAsync($"api/v1/orders/by-code/ABC123", ct);
        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    // ── Test 4: GetByCode unknown code returns 404 ──────────────────────────

    /// <summary>An unknown public code returns 404 for the owning customer.</summary>
    [Fact]
    public async Task GetByCode_UnknownCode_Returns404()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];

        using var seedScope = fixture.Factory.Services.CreateScope();
        var seedDb = seedScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var fleet = BuildFleet(suffix);
        var customer = BuildCustomerUser($"4{suffix[..6]}");
        seedDb.Fleets.Add(fleet);
        seedDb.Users.Add(customer);
        await seedDb.SaveChangesAsync(ct);

        var custClient = fixture.Factory.CreateClient();
        custClient.AsCustomer(customer.Id);
        custClient.DefaultRequestHeaders.Add("X-Fleet-Slug", fleet.Slug);

        var response = await custClient.GetAsync("api/v1/orders/by-code/ZZXXVV", ct);
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    // ── Test 5: GetByCode cross-tenant code returns 404 ─────────────────────

    /// <summary>Even the owning customer cannot reach their order if they supply the wrong fleet slug.
    /// Proves that the tenant filter scopes the by-code lookup to the correct fleet.</summary>
    [Fact]
    public async Task GetByCode_CrossTenantCode_Returns404()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffixA = Guid.NewGuid().ToString("N")[..8];
        var suffixB = Guid.NewGuid().ToString("N")[..8];

        // Seed fleet A with dispatcher + customer, fleet B as the wrong fleet.
        using var seedScope = fixture.Factory.Services.CreateScope();
        var seedDb = seedScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var fleetA = BuildFleet(suffixA);
        var dispatcherA = BuildDispatcher(fleetA.Id, $"5{suffixA[..6]}");
        var customer = BuildCustomerUser($"5{suffixA[..6]}");
        var fleetB = BuildFleet(suffixB);
        seedDb.Fleets.Add(fleetA);
        seedDb.Fleets.Add(fleetB);
        seedDb.Users.Add(dispatcherA);
        seedDb.Users.Add(customer);
        await seedDb.SaveChangesAsync(ct);

        // Create order in fleet A.
        var dispClient = fixture.Factory.CreateClient();
        dispClient.AsDispatcher(fleetA.Id, dispatcherA.Id);
        var (orderId, publicCode) = await CreateOrder(dispClient);

        // Set customer as owner.
        using var updateScope = fixture.Factory.Services.CreateScope();
        var updateTenant = updateScope.ServiceProvider.GetRequiredService<CurrentTenant>();
        updateTenant.FleetId = fleetA.Id;
        var updateDb = updateScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var order = await updateDb.Orders.FirstAsync(o => o.Id == orderId, ct);
        order.CustomerUserId = customer.Id;
        await updateDb.SaveChangesAsync(ct);

        // Customer uses fleet B's slug — tenant filter scopes to fleet B, code not found.
        var custClient = fixture.Factory.CreateClient();
        custClient.AsCustomer(customer.Id);
        custClient.DefaultRequestHeaders.Add("X-Fleet-Slug", fleetB.Slug);

        var response = await custClient.GetAsync($"api/v1/orders/by-code/{publicCode}", ct);
        response.StatusCode.Should().Be(HttpStatusCode.NotFound,
            "public code is scoped to fleet A; looking it up under fleet B's context should return 404");
    }

    // ── Test 6 (RED → GREEN): AddNote dispatcher writes NoteAdded event ──────

    /// <summary>Dispatcher adds a note; a NoteAdded OrderEvent is written with no status change.</summary>
    [Fact]
    public async Task AddNote_Dispatcher_WritesNoteAddedEvent()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];

        using var seedScope = fixture.Factory.Services.CreateScope();
        var seedDb = seedScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var fleet = BuildFleet(suffix);
        var dispatcher = BuildDispatcher(fleet.Id, $"5{suffix[..6]}");
        seedDb.Fleets.Add(fleet);
        seedDb.Users.Add(dispatcher);
        await seedDb.SaveChangesAsync(ct);

        var dispClient = fixture.Factory.CreateClient();
        dispClient.AsDispatcher(fleet.Id, dispatcher.Id);
        var (orderId, _) = await CreateOrder(dispClient);

        var response = await dispClient.PostAsJsonAsync(
            $"api/v1/orders/{orderId}/notes",
            new AddNoteRequest { Text = "Driver is running 5 minutes late" },
            ct);

        response.StatusCode.Should().Be(HttpStatusCode.NoContent);

        // Assert NoteAdded event was written and order status unchanged.
        using var verifyScope = fixture.Factory.Services.CreateScope();
        var verifyTenant = verifyScope.ServiceProvider.GetRequiredService<CurrentTenant>();
        verifyTenant.FleetId = fleet.Id;
        var verifyDb = verifyScope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        var events = await verifyDb.OrderEvents.AsNoTracking()
            .Where(e => e.OrderId == orderId)
            .OrderBy(e => e.At)
            .ToListAsync(ct);

        events.Should().ContainSingle(e => e.Type == OrderEventType.NoteAdded,
            "exactly one NoteAdded event should be written");

        var noteEvent = events.First(e => e.Type == OrderEventType.NoteAdded);
        noteEvent.FromStatus.Should().Be(OrderStatus.New, "NoteAdded should preserve current status as FromStatus");
        noteEvent.ToStatus.Should().Be(OrderStatus.New, "NoteAdded should preserve current status as ToStatus");
        noteEvent.ActorUserId.Should().Be(dispatcher.Id);

        var order = await verifyDb.Orders.AsNoTracking().FirstAsync(o => o.Id == orderId, ct);
        order.Status.Should().Be(OrderStatus.New, "adding a note must not change order status");
    }

    // ── Test 6 (Unit): AddNoteValidator empty text fails with code ────────────

    /// <summary>Unit test: AddNoteValidator rejects empty text with the correct error code.</summary>
    [Fact]
    public void AddNoteValidator_EmptyText_FailsWithCode()
    {
        var validator = new AddNoteValidator();
        var result = validator.TestValidate(new AddNoteRequest { Text = "" });
        result.ShouldHaveValidationErrorFor(x => x.Text)
            .WithErrorCode(ErrorCodes.Validation.NoteTextRequired);
    }

    // ── Test 7 (Unit): AddNoteValidator too-long text fails ──────────────────

    /// <summary>Unit test: AddNoteValidator rejects text exceeding 2000 characters.</summary>
    [Fact]
    public void AddNoteValidator_TooLongText_FailsWithCode()
    {
        var validator = new AddNoteValidator();
        var result = validator.TestValidate(new AddNoteRequest { Text = new string('a', 2001) });
        result.ShouldHaveValidationErrorFor(x => x.Text)
            .WithErrorCode(ErrorCodes.Validation.NoteTextTooLong);
    }

    // ── Test 8: AddNote cross-tenant order returns 404 ───────────────────────

    /// <summary>Dispatcher of fleet B cannot add a note to an order belonging to fleet A.</summary>
    [Fact]
    public async Task AddNote_CrossTenant_Returns404()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffixA = Guid.NewGuid().ToString("N")[..8];
        var suffixB = Guid.NewGuid().ToString("N")[..8];

        using var seedScope = fixture.Factory.Services.CreateScope();
        var seedDb = seedScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var fleetA = BuildFleet(suffixA);
        var dispatcherA = BuildDispatcher(fleetA.Id, $"6{suffixA[..6]}");
        var fleetB = BuildFleet(suffixB);
        var dispatcherB = BuildDispatcher(fleetB.Id, $"6{suffixB[..6]}");
        seedDb.Fleets.Add(fleetA);
        seedDb.Fleets.Add(fleetB);
        seedDb.Users.Add(dispatcherA);
        seedDb.Users.Add(dispatcherB);
        await seedDb.SaveChangesAsync(ct);

        // Create order in fleet A.
        var clientA = fixture.Factory.CreateClient();
        clientA.AsDispatcher(fleetA.Id, dispatcherA.Id);
        var (orderId, _) = await CreateOrder(clientA);

        // Fleet B dispatcher tries to add a note.
        var clientB = fixture.Factory.CreateClient();
        clientB.AsDispatcher(fleetB.Id, dispatcherB.Id);
        var response = await clientB.PostAsJsonAsync(
            $"api/v1/orders/{orderId}/notes",
            new AddNoteRequest { Text = "This should fail" },
            ct);

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    // ── Test 9 (RED → GREEN): GetEvents dispatcher returns chronological list ─

    /// <summary>Dispatcher retrieves events for an order — returned in ascending At order.</summary>
    [Fact]
    public async Task GetEvents_Dispatcher_ReturnsChronological()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];

        using var seedScope = fixture.Factory.Services.CreateScope();
        var seedDb = seedScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var fleet = BuildFleet(suffix);
        var dispatcher = BuildDispatcher(fleet.Id, $"7{suffix[..6]}");
        seedDb.Fleets.Add(fleet);
        seedDb.Users.Add(dispatcher);
        await seedDb.SaveChangesAsync(ct);

        var dispClient = fixture.Factory.CreateClient();
        dispClient.AsDispatcher(fleet.Id, dispatcher.Id);
        var (orderId, _) = await CreateOrder(dispClient);

        // Add a note so there are at least 2 events.
        await dispClient.PostAsJsonAsync(
            $"api/v1/orders/{orderId}/notes",
            new AddNoteRequest { Text = "Test note" },
            ct);

        var response = await dispClient.GetAsync($"api/v1/orders/{orderId}/events", ct);
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadAsStringAsync(ct);
        body.Should().Contain("Created",
            "the Created event from order creation should be in the list");
        body.Should().Contain("NoteAdded",
            "the NoteAdded event should be in the list");

        // Parse events array from the response wrapper and assert chronological order.
        var doc = JsonSerializer.Deserialize<JsonElement>(body, JsonOptions);
        var events = doc.GetProperty("events").EnumerateArray().ToArray();
        events.Length.Should().BeGreaterThanOrEqualTo(2);

        var timestamps = events
            .Select(e => e.GetProperty("at").GetDateTimeOffset())
            .ToList();
        timestamps.Should().BeInAscendingOrder("events must be returned chronologically");
    }

    // ── Test F2: GetByCode with assigned active-status driver exposes first name + position ──

    /// <summary>Driver assigned and accepted (active status) → first name present, surname absent from raw JSON,
    /// position non-null. Before accept (Assigned status) → position is null.</summary>
    [Fact]
    public async Task GetByCode_AssignedDriverActiveStatus_ReturnsFirstNameAndPosition()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];

        // Seed fleet, dispatcher, customer, vehicle, driver user, driver row.
        using var seedScope = fixture.Factory.Services.CreateScope();
        var seedDb = seedScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var fleet = BuildFleet(suffix);
        var dispatcher = BuildDispatcher(fleet.Id, $"9{suffix[..6]}");
        var customer = BuildCustomerUser($"9{suffix[..6]}");
        // Two-token ASCII name: "Tomas Horak" — surname must NOT appear in the response.
        var driverUserEntity = new User
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            Role = UserRole.Driver,
            Phone = $"+420608{suffix[..7]}",
            DisplayName = "Tomas Horak",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        };
        var vehicle = BuildVehicle(fleet.Id);
        var driverRow = new Driver
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            UserId = driverUserEntity.Id,
            Status = DriverStatus.Free,
            CurrentVehicleId = vehicle.Id,
            // Seed position so endpoint can expose it when active.
            LastLat = 50.0755,
            LastLng = 14.4378,
            IsActive = true
        };
        seedDb.Fleets.Add(fleet);
        seedDb.Users.Add(dispatcher);
        seedDb.Users.Add(customer);
        seedDb.Users.Add(driverUserEntity);
        seedDb.Vehicles.Add(vehicle);
        seedDb.Drivers.Add(driverRow);
        await seedDb.SaveChangesAsync(ct);

        // Create order as dispatcher.
        var dispClient = fixture.Factory.CreateClient();
        dispClient.AsDispatcher(fleet.Id, dispatcher.Id);
        var (orderId, publicCode) = await CreateOrder(dispClient);

        // Set customer as owner via direct DB.
        using var ownerScope = fixture.Factory.Services.CreateScope();
        var ownerTenant = ownerScope.ServiceProvider.GetRequiredService<CurrentTenant>();
        ownerTenant.FleetId = fleet.Id;
        var ownerDb = ownerScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var orderEntity = await ownerDb.Orders.FirstAsync(o => o.Id == orderId, ct);
        orderEntity.CustomerUserId = customer.Id;
        await ownerDb.SaveChangesAsync(ct);

        // Assign the order to the driver (Dispatcher POST /assign).
        var assignResponse = await dispClient.PostAsJsonAsync(
            $"api/v1/orders/{orderId}/assign",
            new { DriverId = driverRow.Id },
            ct);
        assignResponse.StatusCode.Should().Be(HttpStatusCode.OK);

        // Customer GETs by code while status = Assigned (non-active) → position must be null.
        var custClient = fixture.Factory.CreateClient();
        custClient.AsCustomer(customer.Id);
        custClient.DefaultRequestHeaders.Add("X-Fleet-Slug", fleet.Slug);

        var assignedResponse = await custClient.GetAsync($"api/v1/orders/by-code/{publicCode}", ct);
        assignedResponse.StatusCode.Should().Be(HttpStatusCode.OK);

        var assignedJson = await assignedResponse.Content.ReadAsStringAsync(ct);
        // First name present, surname absent.
        assignedJson.Should().Contain("Tomas", "driver first name must be in the reduced DTO");
        assignedJson.Should().NotContain("Horak", "driver surname must be stripped from the reduced DTO");

        // Position null for Assigned (non-active) status.
        var assignedDoc = JsonSerializer.Deserialize<JsonElement>(assignedJson, JsonOptions);
        assignedDoc.GetProperty("position").ValueKind.Should().Be(JsonValueKind.Null,
            "position must be null when status is Assigned (not yet active)");

        // Accept the order as the driver (Driver POST /accept).
        var driverClient = fixture.Factory.CreateClient();
        driverClient.AsDriver(fleet.Id, driverUserEntity.Id);
        var acceptResponse = await driverClient.PostAsJsonAsync(
            $"api/v1/orders/{orderId}/accept",
            new { },
            ct);
        acceptResponse.StatusCode.Should().Be(HttpStatusCode.OK);

        // Customer GETs by code again while status = Accepted (active) → position must be present.
        var acceptedResponse = await custClient.GetAsync($"api/v1/orders/by-code/{publicCode}", ct);
        acceptedResponse.StatusCode.Should().Be(HttpStatusCode.OK);

        var acceptedJson = await acceptedResponse.Content.ReadAsStringAsync(ct);
        var acceptedDoc = JsonSerializer.Deserialize<JsonElement>(acceptedJson, JsonOptions);

        var position = acceptedDoc.GetProperty("position");
        position.ValueKind.Should().Be(JsonValueKind.Object,
            "position must be present (non-null) when status is Accepted");
        position.GetProperty("lat").GetDouble().Should().BeApproximately(50.0755, 0.0001);
        position.GetProperty("lng").GetDouble().Should().BeApproximately(14.4378, 0.0001);
    }

    // ── Test 10: GetEvents cross-tenant returns 404 ──────────────────────────

    /// <summary>Dispatcher of fleet B cannot retrieve events for an order of fleet A.</summary>
    [Fact]
    public async Task GetEvents_CrossTenant_Returns404()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffixA = Guid.NewGuid().ToString("N")[..8];
        var suffixB = Guid.NewGuid().ToString("N")[..8];

        using var seedScope = fixture.Factory.Services.CreateScope();
        var seedDb = seedScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var fleetA = BuildFleet(suffixA);
        var dispatcherA = BuildDispatcher(fleetA.Id, $"8{suffixA[..6]}");
        var fleetB = BuildFleet(suffixB);
        var dispatcherB = BuildDispatcher(fleetB.Id, $"8{suffixB[..6]}");
        seedDb.Fleets.Add(fleetA);
        seedDb.Fleets.Add(fleetB);
        seedDb.Users.Add(dispatcherA);
        seedDb.Users.Add(dispatcherB);
        await seedDb.SaveChangesAsync(ct);

        var clientA = fixture.Factory.CreateClient();
        clientA.AsDispatcher(fleetA.Id, dispatcherA.Id);
        var (orderId, _) = await CreateOrder(clientA);

        var clientB = fixture.Factory.CreateClient();
        clientB.AsDispatcher(fleetB.Id, dispatcherB.Id);
        var response = await clientB.GetAsync($"api/v1/orders/{orderId}/events", ct);

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}

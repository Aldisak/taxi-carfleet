using System.Collections.Concurrent;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Realtime;

/// <summary>Integration tests for <c>FleetHub</c> at <c>/hubs/fleet</c>.
/// Uses a real SignalR client over Long Polling against the TestServer.</summary>
[Collection(TestCollections.Database)]
public sealed class FleetHubTests(PostgresFixture fixture) : IAsyncDisposable
{
    // Each test gets its own TaxiApiFactory so clock advances don't contaminate the shared instance.
    private readonly TaxiApiFactory _factory = new(fixture.ConnectionString);
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        Converters = { new System.Text.Json.Serialization.JsonStringEnumConverter() }
    };

    // ── Seed helpers ──────────────────────────────────────────────────────────

    private static Fleet BuildFleet(string slugSuffix) => new()
    {
        Id = Guid.CreateVersion7(),
        Slug = $"hub-{slugSuffix}",
        Name = $"Hub Test Fleet {slugSuffix}",
        Phone = "+420600700800",
        Currency = "CZK",
        TimeZone = "Europe/Prague",
        IsActive = true,
        CreatedAt = DateTimeOffset.UtcNow
    };

    private static User BuildDriverUser(Guid fleetId, string phoneSuffix) => new()
    {
        Id = Guid.CreateVersion7(),
        FleetId = fleetId,
        Role = UserRole.Driver,
        Phone = $"+420730{phoneSuffix}",
        DisplayName = "Hub Test Driver",
        IsActive = true,
        CreatedAt = DateTimeOffset.UtcNow
    };

    private static User BuildDispatcherUser(Guid fleetId, string phoneSuffix) => new()
    {
        Id = Guid.CreateVersion7(),
        FleetId = fleetId,
        Role = UserRole.Dispatcher,
        Phone = $"+420740{phoneSuffix}",
        DisplayName = "Hub Test Dispatcher",
        IsActive = true,
        CreatedAt = DateTimeOffset.UtcNow
    };

    private static User BuildCustomerUser(string phoneSuffix) => new()
    {
        Id = Guid.CreateVersion7(),
        FleetId = null,
        Role = UserRole.Customer,
        Phone = $"+420750{phoneSuffix}",
        DisplayName = "Hub Test Customer",
        IsActive = true,
        CreatedAt = DateTimeOffset.UtcNow
    };

    private static Driver BuildDriver(Guid fleetId, Guid userId,
        DriverStatus status = DriverStatus.Free) => new()
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleetId,
            UserId = userId,
            Status = status,
            IsActive = true
        };

    private static Vehicle BuildVehicle(Guid fleetId, string plate) => new()
    {
        Id = Guid.CreateVersion7(),
        FleetId = fleetId,
        Plate = plate,
        Make = "Skoda",
        Model = "Octavia",
        Color = "White",
        Seats = 4,
        IsActive = true
    };

    private static Order BuildOrder(Guid fleetId, Guid? driverId, Guid? customerUserId,
        OrderStatus status = OrderStatus.Accepted) => new()
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleetId,
            PublicCode = $"{Guid.NewGuid().ToString()[..6].ToUpperInvariant()}",
            Status = status,
            Source = OrderSource.App,
            CustomerUserId = customerUserId,
            CustomerPhone = "+420700800900",
            PickupAddress = "Test Pickup",
            PickupLat = 50.0,
            PickupLng = 15.0,
            PriceType = PriceType.Estimate,
            DriverId = driverId,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow,
            Version = 1
        };

    /// <summary>Seeds the given entities (bypassing tenant guard via null tenant scope).</summary>
    private async Task SeedAsync(params object[] entities)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.AddRange(entities);
        await db.SaveChangesAsync();
    }

    /// <summary>Builds a SignalR hub connection to /hubs/fleet using Long Polling transport
    /// and the given JWT access token.</summary>
    private HubConnection BuildHubConnection(string token) =>
        new HubConnectionBuilder()
            .WithUrl("http://localhost/hubs/fleet", o =>
            {
                o.HttpMessageHandlerFactory = _ => _factory.Server.CreateHandler();
                o.Transports = HttpTransportType.LongPolling;
                o.AccessTokenProvider = () => Task.FromResult<string?>(token);
            })
            .Build();

    // ── Tests ─────────────────────────────────────────────────────────────────

    /// <summary>A driver sends 10 rapid position updates; the dispatcher client receives exactly
    /// 1 (throttle to max 1 per 3 s). After the clock advances 3 s, a second update is delivered.</summary>
    [Fact]
    public async Task UpdatePosition_At10Hz_ThrottledToOnePer3s_ReachesDispatcherClient()
    {
        // Arrange
        var fleet = BuildFleet("throttle");
        var driverUser = BuildDriverUser(fleet.Id, "001001");
        var dispatcherUser = BuildDispatcherUser(fleet.Id, "002002");
        var driver = BuildDriver(fleet.Id, driverUser.Id);
        await SeedAsync(fleet, driverUser, dispatcherUser, driver);

        var driverToken = AuthHelpers.MintTokenFor(driverUser.Id, UserRole.Driver, fleet.Id);
        var dispatcherToken = AuthHelpers.MintTokenFor(dispatcherUser.Id, UserRole.Dispatcher, fleet.Id);

        await using var dispatcherConn = BuildHubConnection(dispatcherToken);
        await using var driverConn = BuildHubConnection(driverToken);

        var received = new ConcurrentBag<JsonElement>();
        dispatcherConn.On<JsonElement>("DriverPositionChanged", msg => received.Add(msg));

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        await dispatcherConn.StartAsync(cts.Token);
        await driverConn.StartAsync(cts.Token);

        // Act — send 10 rapid updates (clock frozen, throttle window hasn't elapsed)
        for (var i = 0; i < 10; i++)
        {
            await driverConn.InvokeAsync("UpdatePosition", 50.0 + i * 0.001, 15.0, 90.0, 30.0, cts.Token);
        }

        // Wait briefly for first delivery to arrive
        await Task.Delay(500, cts.Token);

        // Assert — exactly 1 delivery (throttled)
        received.Should().HaveCount(1);

        // Act 2 — advance clock by 3 s, send another update
        _factory.FakeTime.Advance(TimeSpan.FromSeconds(3));
        await driverConn.InvokeAsync("UpdatePosition", 51.0, 15.0, 90.0, 30.0, cts.Token);
        await Task.Delay(500, cts.Token);

        // Assert 2 — now 2 total deliveries
        received.Should().HaveCount(2);
    }

    /// <summary>Position updates from FleetA driver are not received by FleetB dispatcher (tenant isolation).</summary>
    [Fact]
    public async Task UpdatePosition_DriverOfFleetA_NotReceivedByFleetBDispatcher()
    {
        // Arrange
        var fleetA = BuildFleet("iso-a");
        var fleetB = BuildFleet("iso-b");
        var driverUserA = BuildDriverUser(fleetA.Id, "011011");
        var dispatcherUserB = BuildDispatcherUser(fleetB.Id, "012012");
        var driverA = BuildDriver(fleetA.Id, driverUserA.Id);
        await SeedAsync(fleetA, fleetB, driverUserA, dispatcherUserB, driverA);

        var driverAToken = AuthHelpers.MintTokenFor(driverUserA.Id, UserRole.Driver, fleetA.Id);
        var dispatcherBToken = AuthHelpers.MintTokenFor(dispatcherUserB.Id, UserRole.Dispatcher, fleetB.Id);

        await using var driverConn = BuildHubConnection(driverAToken);
        await using var dispatcherConn = BuildHubConnection(dispatcherBToken);

        var received = new ConcurrentBag<JsonElement>();
        dispatcherConn.On<JsonElement>("DriverPositionChanged", msg => received.Add(msg));

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        await dispatcherConn.StartAsync(cts.Token);
        await driverConn.StartAsync(cts.Token);

        // Act
        await driverConn.InvokeAsync("UpdatePosition", 50.0, 15.0, 90.0, 30.0, cts.Token);
        await Task.Delay(500, cts.Token);

        // Assert — FleetB dispatcher sees nothing
        received.Should().BeEmpty();
    }

    /// <summary>A non-driver (dispatcher) calling UpdatePosition must not broadcast to any client.</summary>
    [Fact]
    public async Task UpdatePosition_NonDriver_Rejected()
    {
        // Arrange
        var fleet = BuildFleet("nondriver");
        var dispatcherUser = BuildDispatcherUser(fleet.Id, "021021");
        var dispatcherUser2 = BuildDispatcherUser(fleet.Id, "021022");
        await SeedAsync(fleet, dispatcherUser, dispatcherUser2);

        var dispatcherToken = AuthHelpers.MintTokenFor(dispatcherUser.Id, UserRole.Dispatcher, fleet.Id);
        var listenerToken = AuthHelpers.MintTokenFor(dispatcherUser2.Id, UserRole.Dispatcher, fleet.Id);

        await using var callerConn = BuildHubConnection(dispatcherToken);
        await using var listenerConn = BuildHubConnection(listenerToken);

        var received = new ConcurrentBag<JsonElement>();
        listenerConn.On<JsonElement>("DriverPositionChanged", msg => received.Add(msg));

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        await listenerConn.StartAsync(cts.Token);
        await callerConn.StartAsync(cts.Token);

        // Act — dispatcher invokes UpdatePosition (should be silently ignored)
        await callerConn.InvokeAsync("UpdatePosition", 50.0, 15.0, 90.0, 30.0, cts.Token);
        await Task.Delay(500, cts.Token);

        // Assert
        received.Should().BeEmpty();
    }

    /// <summary>Customer subscribes to their order group; when OrderChanged is broadcast by the
    /// SignalR publisher, the customer client receives it. Also proves real publisher replaced no-op.</summary>
    [Fact]
    public async Task Subscribe_OwnerJoinsOrderGroup_ReceivesOrderChanged()
    {
        // Arrange
        var fleet = BuildFleet("sub-owner");
        var customerUser = BuildCustomerUser("031031");
        var dispatcherUser = BuildDispatcherUser(fleet.Id, "031032");
        var driverUser = BuildDriverUser(fleet.Id, "031033");
        var driver = BuildDriver(fleet.Id, driverUser.Id);
        var vehicle = BuildVehicle(fleet.Id, "SUB-001");
        var order = BuildOrder(fleet.Id, driver.Id, customerUser.Id, OrderStatus.New);
        await SeedAsync(fleet, customerUser, dispatcherUser, driverUser, driver, vehicle, order);

        var customerToken = AuthHelpers.MintTokenFor(customerUser.Id, UserRole.Customer, fleetId: null);
        var dispatcherToken = AuthHelpers.MintTokenFor(dispatcherUser.Id, UserRole.Dispatcher, fleet.Id);

        await using var customerConn = BuildHubConnection(customerToken);
        await using var dispatcherConn = BuildHubConnection(dispatcherToken);

        var received = new ConcurrentBag<JsonElement>();
        customerConn.On<JsonElement>("OrderChanged", msg => received.Add(msg));

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        await customerConn.StartAsync(cts.Token);
        await customerConn.InvokeAsync("Subscribe", order.Id, cts.Token);

        await dispatcherConn.StartAsync(cts.Token);

        // Act — dispatcher assigns the order (via HTTP) which triggers OrderChanged broadcast
        var httpClient = _factory.CreateClient();
        httpClient.AsDispatcher(fleet.Id, dispatcherUser.Id);
        var assignResponse = await httpClient.PostAsJsonAsync(
            $"api/v1/orders/{order.Id}/assign",
            new { driverId = driver.Id, version = order.Version },
            cts.Token);
        assignResponse.IsSuccessStatusCode.Should().BeTrue(
            $"assign failed with {assignResponse.StatusCode}: {await assignResponse.Content.ReadAsStringAsync(cts.Token)}");

        // Wait for SignalR to deliver
        await Task.Delay(1000, cts.Token);

        // Assert — received at least one event
        received.Should().HaveCountGreaterOrEqualTo(1);
        // F1 assertion: OrderChangedDto must carry "source" field as string (e.g. "App") so web decideSound gate is reachable
        var firstMsg = received.First();
        firstMsg.TryGetProperty("source", out var sourceProp).Should().BeTrue("OrderChangedDto must include a 'source' property");
        sourceProp.GetString().Should().Be("App", "the seeded order has Source=App and it must arrive as the string 'App'");
    }

    /// <summary>A non-owner customer subscribing to an order group must not receive OrderChanged
    /// events for that order.</summary>
    [Fact]
    public async Task Subscribe_NonOwner_DoesNotReceive()
    {
        // Arrange
        var fleet = BuildFleet("sub-nonowner");
        var ownerUser = BuildCustomerUser("041041");
        var otherUser = BuildCustomerUser("041042");
        var dispatcherUser = BuildDispatcherUser(fleet.Id, "041043");
        var driverUser = BuildDriverUser(fleet.Id, "041044");
        var driver = BuildDriver(fleet.Id, driverUser.Id);
        var order = BuildOrder(fleet.Id, driver.Id, ownerUser.Id, OrderStatus.New);
        await SeedAsync(fleet, ownerUser, otherUser, dispatcherUser, driverUser, driver, order);

        var otherToken = AuthHelpers.MintTokenFor(otherUser.Id, UserRole.Customer, fleetId: null);
        var dispatcherToken = AuthHelpers.MintTokenFor(dispatcherUser.Id, UserRole.Dispatcher, fleet.Id);

        await using var otherConn = BuildHubConnection(otherToken);
        await using var dispatcherConn = BuildHubConnection(dispatcherToken);

        var received = new ConcurrentBag<JsonElement>();
        otherConn.On<JsonElement>("OrderChanged", msg => received.Add(msg));

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        await otherConn.StartAsync(cts.Token);
        // Non-owner tries to subscribe (should be silently refused — no group join)
        await otherConn.InvokeAsync("Subscribe", order.Id, cts.Token);

        await dispatcherConn.StartAsync(cts.Token);

        // Act — dispatcher assigns the order via HTTP
        var httpClient = _factory.CreateClient();
        httpClient.AsDispatcher(fleet.Id, dispatcherUser.Id);
        await httpClient.PostAsJsonAsync(
            $"api/v1/orders/{order.Id}/assign",
            new { driverId = driver.Id, version = order.Version },
            cts.Token);

        await Task.Delay(1000, cts.Token);

        // Assert — non-owner received nothing
        received.Should().BeEmpty();
    }

    /// <summary>Dispatcher auto-joins dispatch group on connect; when driver goes online (HTTP),
    /// the dispatcher client receives DriverStatusChanged.</summary>
    [Fact]
    public async Task OnConnected_DispatcherAutoJoinsDispatchGroup_ReceivesDriverStatusChanged()
    {
        // Arrange
        var fleet = BuildFleet("dispatch-grp");
        var driverUser = BuildDriverUser(fleet.Id, "051051");
        var dispatcherUser = BuildDispatcherUser(fleet.Id, "051052");
        var driver = BuildDriver(fleet.Id, driverUser.Id, DriverStatus.Offline);
        var vehicle = BuildVehicle(fleet.Id, "DISP-001");
        await SeedAsync(fleet, driverUser, dispatcherUser, driver, vehicle);

        var driverToken = AuthHelpers.MintTokenFor(driverUser.Id, UserRole.Driver, fleet.Id);
        var dispatcherToken = AuthHelpers.MintTokenFor(dispatcherUser.Id, UserRole.Dispatcher, fleet.Id);

        await using var dispatcherConn = BuildHubConnection(dispatcherToken);

        var received = new ConcurrentBag<JsonElement>();
        dispatcherConn.On<JsonElement>("DriverStatusChanged", msg => received.Add(msg));

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        await dispatcherConn.StartAsync(cts.Token);

        // Act — driver goes online via HTTP (triggers DriverStatusChanged broadcast)
        var httpClient = _factory.CreateClient();
        httpClient.AsDriver(fleet.Id, driverUser.Id);
        var goOnlineResponse = await httpClient.PostAsJsonAsync(
            "api/v1/drivers/me/online",
            new { vehicleId = vehicle.Id },
            cts.Token);
        goOnlineResponse.IsSuccessStatusCode.Should().BeTrue(
            $"go-online failed: {await goOnlineResponse.Content.ReadAsStringAsync(cts.Token)}");

        await Task.Delay(1000, cts.Token);

        // Assert
        received.Should().HaveCountGreaterOrEqualTo(1);
    }

    /// <inheritdoc />
    public async ValueTask DisposeAsync()
    {
        await _factory.DisposeAsync();
    }
}

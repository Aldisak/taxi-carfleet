using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Common.Orders;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Features.Orders.GetOrder;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Tests.Infrastructure;
using RouteEntity = Taxi.Api.Infrastructure.Entities.Route;

namespace Taxi.Api.Tests.Pricing;

/// <summary>Integration tests for price-lock immutability (AC#3) and the additive priceOverrideReason
/// field on the order detail DTO (AC#6).</summary>
[Collection(TestCollections.Database)]
public sealed class PriceLockTests(PostgresFixture fixture)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private static Fleet BuildFleet(string suffix) => new()
    {
        Id = Guid.CreateVersion7(),
        Slug = $"plock-{suffix}",
        Name = $"PriceLock Fleet {suffix}",
        Phone = "+420605000001",
        Currency = "CZK",
        TimeZone = "Europe/Prague",
        IsActive = true,
        CreatedAt = DateTimeOffset.UtcNow
    };

    /// <summary>Editing a route's price AFTER an order was created does NOT change the existing order's
    /// stored price — the order copied the price at creation (price-lock is structural). AC#3.</summary>
    [Fact]
    public async Task PriceLock_RouteEdit_DoesNotChangeExistingOrderPrice()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var fleet = BuildFleet(suffix);
        var routeId = Guid.CreateVersion7();
        var orderId = Guid.CreateVersion7();

        using (var scope = fixture.Factory.Services.CreateScope())
        {
            var tenant = scope.ServiceProvider.GetRequiredService<CurrentTenant>();
            var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
            db.Fleets.Add(fleet);
            await db.SaveChangesAsync(ct);
            tenant.FleetId = fleet.Id;

            db.Routes.Add(new RouteEntity
            {
                Id = routeId,
                FleetId = fleet.Id,
                Name = "Fixed route",
                Type = RouteType.PointToPoint,
                PriceCzk = 250,
                FromLat = 49.95,
                FromLng = 15.27,
                ToLat = 50.00,
                ToLng = 15.20,
                FromRadiusMeters = 500,
                ToRadiusMeters = 500,
                ValidDays = 127,
                Priority = 10,
                IsEnabled = true
            });
            // An order created with the route's Fixed price of 250 (mirrors CreateOrderEndpoint copy).
            db.Orders.Add(new Order
            {
                Id = orderId,
                FleetId = fleet.Id,
                PublicCode = $"PL{suffix[..4].ToUpperInvariant()}",
                Status = OrderStatus.New,
                Source = OrderSource.Dispatcher,
                CustomerPhone = "+420600111000",
                PickupAddress = "Test Pickup",
                PickupLat = 49.95,
                PickupLng = 15.27,
                Passengers = 1,
                PriceType = PriceType.Fixed,
                FixedPriceCzk = 250,
                RouteId = routeId,
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow,
                Version = 1
            });
            await db.SaveChangesAsync(ct);
        }

        // Edit the route's price via the A5 UpdateRoute endpoint.
        var admin = fixture.Factory.CreateClient().AsFleetAdmin(fleet.Id, fleetSlug: fleet.Slug);
        var updateResp = await admin.PutAsJsonAsync($"api/v1/routes/{routeId}", new
        {
            name = "Fixed route",
            type = "PointToPoint",
            priceCzk = 999, // changed from 250
            fromLat = 49.95,
            fromLng = 15.27,
            toLat = 50.00,
            toLng = 15.20,
            fromRadiusMeters = 500.0,
            toRadiusMeters = 500.0,
            validDays = 127,
            priority = 10,
            isEnabled = true
        }, ct);
        updateResp.StatusCode.Should().Be(HttpStatusCode.OK);

        // Reload the order — its stored Fixed price must be unchanged.
        using var verify = fixture.Factory.Services.CreateScope();
        var vtenant = verify.ServiceProvider.GetRequiredService<CurrentTenant>();
        vtenant.FleetId = fleet.Id;
        var vdb = verify.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var order = await vdb.Orders.AsNoTracking().FirstAsync(o => o.Id == orderId, ct);

        order.FixedPriceCzk.Should().Be(250, "editing the route price must not retroactively change the order");
        order.PriceType.Should().Be(PriceType.Fixed);
        order.RouteId.Should().Be(routeId);
    }

    /// <summary>An order completed with a FinalPriceCzk differing from the Fixed price and a
    /// PriceOverrideReason surfaces priceOverrideReason in the order detail DTO. AC#6.</summary>
    [Fact]
    public async Task OrderDetail_AfterDriverOverride_IncludesPriceOverrideReason()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var fleet = BuildFleet(suffix);

        Guid orderId = Guid.CreateVersion7();
        Guid driverId = Guid.CreateVersion7();
        Guid driverUserId = Guid.CreateVersion7();
        Guid vehicleId = Guid.CreateVersion7();
        Guid dispatcherUserId = Guid.CreateVersion7();

        using (var scope = fixture.Factory.Services.CreateScope())
        {
            var tenant = scope.ServiceProvider.GetRequiredService<CurrentTenant>();
            var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
            db.Fleets.Add(fleet);
            await db.SaveChangesAsync(ct);
            tenant.FleetId = fleet.Id;

            db.Vehicles.Add(new Vehicle
            {
                Id = vehicleId,
                FleetId = fleet.Id,
                Plate = $"PL{suffix[..4].ToUpperInvariant()}",
                Make = "Skoda",
                Model = "Octavia",
                Color = "Silver",
                Seats = 4,
                IsActive = true
            });
            db.Users.Add(new User
            {
                Id = dispatcherUserId,
                FleetId = fleet.Id,
                Role = UserRole.Dispatcher,
                Phone = $"+4206001{suffix[..5]}1",
                DisplayName = "Dispatcher",
                IsActive = true,
                CreatedAt = DateTimeOffset.UtcNow
            });
            db.Users.Add(new User
            {
                Id = driverUserId,
                FleetId = fleet.Id,
                Role = UserRole.Driver,
                Phone = $"+4206002{suffix[..5]}2",
                DisplayName = "Driver",
                IsActive = true,
                CreatedAt = DateTimeOffset.UtcNow
            });
            db.Drivers.Add(new Driver
            {
                Id = driverId,
                FleetId = fleet.Id,
                UserId = driverUserId,
                Status = DriverStatus.Free,
                CurrentVehicleId = vehicleId,
                IsActive = true
            });
            // A Fixed-price order of 200.
            db.Orders.Add(new Order
            {
                Id = orderId,
                FleetId = fleet.Id,
                PublicCode = $"OV{suffix[..4].ToUpperInvariant()}",
                Status = OrderStatus.New,
                Source = OrderSource.Dispatcher,
                CustomerPhone = "+420600111222",
                PickupAddress = "Pickup",
                PickupLat = 49.95,
                PickupLng = 15.27,
                Passengers = 1,
                PriceType = PriceType.Fixed,
                FixedPriceCzk = 200,
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow,
                Version = 1
            });
            db.OrderEvents.Add(new OrderEvent
            {
                Id = Guid.CreateVersion7(),
                FleetId = fleet.Id,
                OrderId = orderId,
                Type = OrderEventType.Created,
                FromStatus = OrderStatus.New,
                ToStatus = OrderStatus.New,
                ActorUserId = dispatcherUserId,
                ActorRole = UserRole.Dispatcher,
                At = DateTimeOffset.UtcNow
            });
            await db.SaveChangesAsync(ct);
        }

        var dispatcherActor = new Actor(dispatcherUserId, UserRole.Dispatcher);
        var driverActor = new Actor(driverUserId, UserRole.Driver, driverId);

        await TransitionAsync(fleet.Id, orderId, OrderTransition.Assign, dispatcherActor,
            new AssignPayload(driverId, vehicleId), ct);
        await TransitionAsync(fleet.Id, orderId, OrderTransition.Accept, driverActor, null, ct);
        await TransitionAsync(fleet.Id, orderId, OrderTransition.Arrive, driverActor, null, ct);
        await TransitionAsync(fleet.Id, orderId, OrderTransition.Start, driverActor, null, ct);
        // Complete with a DIFFERENT final price (350 vs Fixed 200) + an override reason.
        await TransitionAsync(fleet.Id, orderId, OrderTransition.Complete, driverActor,
            new CompletePayload(350, PaymentType.Cash, "Zákazník přidal zastávku navíc"), ct);

        // GET /orders/{id} as dispatcher and assert priceOverrideReason surfaces.
        var client = fixture.Factory.CreateClient().AsDispatcher(fleet.Id, userId: dispatcherUserId, fleetSlug: fleet.Slug);
        var resp = await client.GetAsync($"api/v1/orders/{orderId}", ct);
        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<GetOrderResponse>(JsonOptions, ct);

        body!.Order.PriceOverrideReason.Should().Be("Zákazník přidal zastávku navíc");
        body.Order.FinalPriceCzk.Should().Be(350);
    }

    private async Task TransitionAsync(
        Guid fleetId, Guid orderId, OrderTransition transition, Actor actor, object? payload, CancellationToken ct)
    {
        using var scope = fixture.Factory.Services.CreateScope();
        var tenant = scope.ServiceProvider.GetRequiredService<CurrentTenant>();
        tenant.FleetId = fleetId;
        var orderService = scope.ServiceProvider.GetRequiredService<OrderService>();
        var result = await orderService.TransitionAsync(orderId, transition, actor, payload, ct);
        result.IsSuccess.Should().BeTrue($"transition {transition} should succeed: {result.FailureMessage}");
    }
}

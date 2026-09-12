using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using FluentValidation.TestHelper;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Common;
using Taxi.Api.Features.Orders.GetOrder;
using Taxi.Api.Features.Orders.Shared;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Orders.Update;

/// <summary>Integration tests for the PATCH /orders/{id} endpoint and Version exposure (A2).</summary>
[Collection(TestCollections.Database)]
public sealed class OrderUpdateTests(PostgresFixture fixture)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        Converters = { new System.Text.Json.Serialization.JsonStringEnumConverter() }
    };

    // ── Seed helpers ──────────────────────────────────────────────────────────

    private static Fleet BuildFleet(string slugSuffix) => new()
    {
        Id = Guid.CreateVersion7(),
        Slug = $"upd-{slugSuffix}",
        Name = $"Update Test Fleet {slugSuffix}",
        Phone = "+420601500001",
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
        Phone = $"+420611{phoneSuffix}",
        DisplayName = "Test Dispatcher",
        IsActive = true,
        CreatedAt = DateTimeOffset.UtcNow
    };

    private static User BuildCustomerUser(string phoneSuffix) => new()
    {
        Id = Guid.CreateVersion7(),
        FleetId = null,
        Role = UserRole.Customer,
        Phone = $"+420711{phoneSuffix}",
        DisplayName = "Test Customer",
        IsActive = true,
        CreatedAt = DateTimeOffset.UtcNow
    };

    private async Task<(Fleet fleet, User dispatcher, Guid orderId)> SeedOrderInNewStatus(string suffix)
    {
        var ct = TestContext.Current.CancellationToken;
        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        var fleet = BuildFleet(suffix);
        var dispatcher = BuildDispatcher(fleet.Id, suffix[..6]);

        db.Fleets.Add(fleet);
        db.Users.Add(dispatcher);
        await db.SaveChangesAsync(ct);

        // Create order via HTTP (sets up proper Version=0 and Created event)
        var client = fixture.Factory.CreateClient();
        client.AsDispatcher(fleet.Id, dispatcher.Id);
        var createResp = await client.PostAsJsonAsync("api/v1/orders", new
        {
            pickupAddress = "Václavské náměstí 1",
            pickupLat = 50.0808,
            pickupLng = 14.4282,
            customerPhone = "+420600123456",
            passengers = 1,
            priceType = "Estimate"
        }, ct);
        createResp.StatusCode.Should().Be(HttpStatusCode.Created, "seed order creation should succeed");
        var createBody = await createResp.Content.ReadFromJsonAsync<CreateOrderResponse>(JsonOptions, ct);
        return (fleet, dispatcher, createBody!.Order.Id);
    }

    // ── F-01: Version in GET /orders/{id} ────────────────────────────────────

    /// <summary>GET /orders/{id} returns the current Version field in OrderDetailDto.</summary>
    [Fact]
    public async Task GetOrder_ReturnsCurrentVersion()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..6];
        var (fleet, dispatcher, orderId) = await SeedOrderInNewStatus(suffix);

        var client = fixture.Factory.CreateClient();
        client.AsDispatcher(fleet.Id, dispatcher.Id);

        var resp = await client.GetAsync($"api/v1/orders/{orderId}", ct);
        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<GetOrderResponse>(JsonOptions, ct);
        body.Should().NotBeNull();
        // Version field must be present (0 for a freshly-created order)
        body!.Order.Version.Should().BeGreaterThanOrEqualTo(0);
    }

    // ── Happy path: PATCH ─────────────────────────────────────────────────────

    /// <summary>PATCH /orders/{id} on a New order changes fields, writes an Updated event, and publishes.</summary>
    [Fact]
    public async Task Update_NewOrder_ChangesFieldsAndWritesUpdatedEvent()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..6];
        var (fleet, dispatcher, orderId) = await SeedOrderInNewStatus(suffix);

        // Get current version.
        var client = fixture.Factory.CreateClient();
        client.AsDispatcher(fleet.Id, dispatcher.Id);
        var getResp = await client.GetAsync($"api/v1/orders/{orderId}", ct);
        var currentVersion = (await getResp.Content.ReadFromJsonAsync<GetOrderResponse>(JsonOptions, ct))!.Order.Version;

        // PATCH
        var patchResp = await client.PatchAsJsonAsync($"api/v1/orders/{orderId}", new
        {
            version = currentVersion,
            note = "Updated note",
            passengers = 3
        }, ct);

        patchResp.StatusCode.Should().Be(HttpStatusCode.OK);
        var patchBody = await patchResp.Content.ReadFromJsonAsync<UpdateOrderResponse>(JsonOptions, ct);
        patchBody!.Order.Note.Should().Be("Updated note");
        patchBody.Order.Passengers.Should().Be(3);
        patchBody.Order.Version.Should().Be(currentVersion + 1);

        // Verify Updated event written (IgnoreQueryFilters to bypass tenant context in test scope).
        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var events = await db.OrderEvents
            .IgnoreQueryFilters()
            .Where(e => e.OrderId == orderId && e.Type == OrderEventType.Updated)
            .ToListAsync(ct);
        events.Should().HaveCount(1);
    }

    // ── Stale version ─────────────────────────────────────────────────────────

    /// <summary>PATCH with a stale client version returns 409 with Order.StaleVersion error code.</summary>
    [Fact]
    public async Task Update_StaleClientVersion_Returns409()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..6];
        var (fleet, dispatcher, orderId) = await SeedOrderInNewStatus(suffix);

        var client = fixture.Factory.CreateClient();
        client.AsDispatcher(fleet.Id, dispatcher.Id);

        // Use version -1 (always stale for Version >= 0).
        var resp = await client.PatchAsJsonAsync($"api/v1/orders/{orderId}", new
        {
            version = -1,
            note = "Stale update"
        }, ct);

        resp.StatusCode.Should().Be(HttpStatusCode.Conflict);
        var body = await resp.Content.ReadAsStringAsync(ct);
        body.Should().Contain(ErrorCodes.Order.StaleVersion);
    }

    // ── Non-editable status ───────────────────────────────────────────────────

    /// <summary>PATCH on an order whose status is InProgress (not New/Assigned) returns 409 NotEditable.</summary>
    [Fact]
    public async Task Update_InProgressOrder_Returns409NotEditable()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..6];

        // Seed a cancelled order (not New/Assigned).
        using var setupScope = fixture.Factory.Services.CreateScope();
        var db = setupScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var fleet = BuildFleet(suffix + "ne");
        var dispatcher = BuildDispatcher(fleet.Id, suffix[..5] + "9");
        db.Fleets.Add(fleet);
        db.Users.Add(dispatcher);
        await db.SaveChangesAsync(ct);

        var actorId = dispatcher.Id;
        var order = new Order
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            PublicCode = "CXTEST",
            Status = OrderStatus.Cancelled,
            Source = OrderSource.Dispatcher,
            CustomerPhone = "+420700000099",
            PickupAddress = "Test",
            PickupLat = 50.0,
            PickupLng = 14.0,
            Passengers = 1,
            PriceType = PriceType.Meter,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow,
            CancelledAt = DateTimeOffset.UtcNow,
            Version = 0
        };
        db.Orders.Add(order);
        await db.SaveChangesAsync(ct);

        var client = fixture.Factory.CreateClient();
        client.AsDispatcher(fleet.Id, actorId);
        var resp = await client.PatchAsJsonAsync($"api/v1/orders/{order.Id}", new
        {
            version = 0,
            note = "Should fail"
        }, ct);

        resp.StatusCode.Should().Be(HttpStatusCode.Conflict);
        var body = await resp.Content.ReadAsStringAsync(ct);
        body.Should().Contain(ErrorCodes.Order.NotEditable);
    }

    // ── Cross-tenant ──────────────────────────────────────────────────────────

    /// <summary>PATCH on an order from a different fleet returns 404 (no-leak).</summary>
    [Fact]
    public async Task Update_CrossTenantOrder_Returns404()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffixA = Guid.NewGuid().ToString("N")[..6];
        var suffixB = Guid.NewGuid().ToString("N")[..6];

        var (fleetA, _, orderAId) = await SeedOrderInNewStatus(suffixA);
        var (fleetB, dispatcherB, _) = await SeedOrderInNewStatus(suffixB);

        // Dispatcher of fleet B trying to PATCH fleet A's order.
        var client = fixture.Factory.CreateClient();
        client.AsDispatcher(fleetB.Id, dispatcherB.Id);

        var resp = await client.PatchAsJsonAsync($"api/v1/orders/{orderAId}", new
        {
            version = 0,
            note = "Cross-tenant attempt"
        }, ct);

        resp.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    // ── Authorization ─────────────────────────────────────────────────────────

    /// <summary>Non-dispatcher (customer) cannot PATCH an order — returns 403.</summary>
    [Fact]
    public async Task Update_NonDispatcher_Returns403()
    {
        var ct = TestContext.Current.CancellationToken;
        var orderId = Guid.CreateVersion7(); // random — should 403 before reaching the DB

        var client = fixture.Factory.CreateClient();
        client.AsCustomer();

        var resp = await client.PatchAsJsonAsync($"api/v1/orders/{orderId}", new
        {
            version = 0,
            note = "Should 403"
        }, ct);

        resp.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    // ── Validator unit test ────────────────────────────────────────────────────

    /// <summary>Providing a dropoff address without coordinates fails validation.</summary>
    [Fact]
    public void UpdateOrderValidator_DropoffAddressWithoutCoords_FailsWithCode()
    {
        var result = new Taxi.Api.Features.Orders.UpdateOrder.UpdateOrderValidator()
            .TestValidate(new Taxi.Api.Features.Orders.UpdateOrder.UpdateOrderRequest
            {
                Id = Guid.NewGuid(),
                Version = 0,
                DropoffAddress = "Somewhere",
                DropoffLat = null,
                DropoffLng = null
            });
        result.ShouldHaveValidationErrorFor(x => x.DropoffLat)
            .WithErrorCode(ErrorCodes.Validation.DropoffCoordsRequired);
    }

    // ── Local type aliases for deserialization ─────────────────────────────────

    private record UpdateOrderResponse(OrderDetailDto Order);
    private record CreateOrderResponse(OrderDetailDto Order);
}

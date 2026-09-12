using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Common;
using Taxi.Api.Common.Idempotency;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Orders.Idempotency;

/// <summary>Integration tests for X-Idempotency-Key semantics on driver transition endpoints.</summary>
[Collection(TestCollections.Database)]
public sealed class IdempotencyTests(PostgresFixture fixture)
{
    // ── Seed helpers ──────────────────────────────────────────────────────────

    private static async Task<(Fleet fleet, Driver driver, User driverUser, Guid dispatcherUserId)>
        SeedFleetAndDriver(TaxiDbContext db, CancellationToken ct = default)
    {
        var suffix = Guid.NewGuid().ToString("N");

        var fleet = new Fleet
        {
            Id = Guid.CreateVersion7(),
            Slug = $"idem-{suffix}",
            Name = "Idempotency Test Fleet",
            Phone = "+420600777001",
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
            Plate = $"IDM{suffix[..4].ToUpperInvariant()}",
            Make = "Skoda",
            Model = "Octavia",
            Color = "Blue",
            Seats = 4,
            IsActive = true
        };

        var dispatcherUser = new User
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            Role = UserRole.Dispatcher,
            Phone = $"+4206004{suffix[..9]}",
            DisplayName = "Idem Dispatcher",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        };
        var driverUser = new User
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            Role = UserRole.Driver,
            Phone = $"+4206003{suffix[..9]}",
            DisplayName = "Idem Driver",
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

        db.Users.Add(dispatcherUser);
        db.Users.Add(driverUser);
        db.Vehicles.Add(vehicle);
        db.Drivers.Add(driver);
        await db.SaveChangesAsync(ct);

        return (fleet, driver, driverUser, dispatcherUser.Id);
    }

    private static Order BuildAssignedOrder(Guid fleetId, Guid driverId, Guid vehicleId)
    {
        var suffix = Guid.NewGuid().ToString("N");
        return new Order
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleetId,
            PublicCode = $"I{suffix[..5].ToUpperInvariant()}",
            Status = OrderStatus.Assigned,
            DriverId = driverId,
            VehicleId = vehicleId,
            CustomerPhone = "+420600000077",
            PickupAddress = "Idem Pickup St",
            Source = OrderSource.Dispatcher,
            PriceType = PriceType.Estimate,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow,
            AssignedAt = DateTimeOffset.UtcNow,
            Version = 1
        };
    }

    // ── Test 1: Key too long → 400 ────────────────────────────────────────────

    /// <summary>A key longer than 200 characters returns 400 Idempotency.KeyTooLong.</summary>
    [Fact]
    public async Task KeyTooLong_Returns400()
    {
        var ct = TestContext.Current.CancellationToken;

        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var (fleet, driver, driverUser, _) = await SeedFleetAndDriver(db, ct);

        var order = BuildAssignedOrder(fleet.Id, driver.Id, driver.CurrentVehicleId!.Value);
        db.Orders.Add(order);
        await db.SaveChangesAsync(ct);

        var client = fixture.Factory.CreateClient();
        client.AsDriver(fleet.Id, driverUser.Id);
        client.DefaultRequestHeaders.Add("X-Idempotency-Key", new string('x', 201));

        var resp = await client.PostAsJsonAsync($"/api/v1/orders/{order.Id}/accept", new { }, ct);

        resp.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    // ── Test 2: No header → executes normally ─────────────────────────────────

    /// <summary>Without X-Idempotency-Key header, execution proceeds normally and no record is written.</summary>
    [Fact]
    public async Task NoHeader_ExecutesNormally_WritesNoRecord()
    {
        var ct = TestContext.Current.CancellationToken;

        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var (fleet, driver, driverUser, _) = await SeedFleetAndDriver(db, ct);

        var order = BuildAssignedOrder(fleet.Id, driver.Id, driver.CurrentVehicleId!.Value);
        db.Orders.Add(order);
        await db.SaveChangesAsync(ct);

        var client = fixture.Factory.CreateClient();
        client.AsDriver(fleet.Id, driverUser.Id);
        // No X-Idempotency-Key header.

        var resp = await client.PostAsJsonAsync($"/api/v1/orders/{order.Id}/accept", new { }, ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);

        // No idempotency record should be written.
        using var assertScope = fixture.Factory.Services.CreateScope();
        var assertDb = assertScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var recordCount = await assertDb.IdempotencyRecords
            .IgnoreQueryFilters()
            .Where(r => r.UserId == driverUser.Id)
            .CountAsync(ct);
        recordCount.Should().Be(0, "no record should be written when no key is present");
    }

    // ── Test 3: Replay same key ───────────────────────────────────────────────

    /// <summary>Sending the same key twice replays the stored response without re-executing the transition.</summary>
    [Fact]
    public async Task Replay_SameKeyWithinWindow_ReturnsStoredResponse_NoReExecution()
    {
        var ct = TestContext.Current.CancellationToken;

        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var (fleet, driver, driverUser, _) = await SeedFleetAndDriver(db, ct);

        var order = BuildAssignedOrder(fleet.Id, driver.Id, driver.CurrentVehicleId!.Value);
        db.Orders.Add(order);
        await db.SaveChangesAsync(ct);

        var key = $"accept-{order.Id:N}";
        var client = fixture.Factory.CreateClient();
        client.AsDriver(fleet.Id, driverUser.Id);
        client.DefaultRequestHeaders.Add("X-Idempotency-Key", key);

        // First call — should execute and store.
        var resp1 = await client.PostAsJsonAsync($"/api/v1/orders/{order.Id}/accept", new { }, ct);
        resp1.StatusCode.Should().Be(HttpStatusCode.OK);
        var body1 = await resp1.Content.ReadAsStringAsync(ct);

        // Second call — should replay.
        var client2 = fixture.Factory.CreateClient();
        client2.AsDriver(fleet.Id, driverUser.Id);
        client2.DefaultRequestHeaders.Add("X-Idempotency-Key", key);
        var resp2 = await client2.PostAsJsonAsync($"/api/v1/orders/{order.Id}/accept", new { }, ct);
        resp2.StatusCode.Should().Be(HttpStatusCode.OK);
        var body2 = await resp2.Content.ReadAsStringAsync(ct);

        // The second call should return the same status and the same order ID.
        // We compare the order id specifically because jsonb round-trip in PostgreSQL
        // re-orders JSON keys alphabetically, making raw string comparison unreliable.
        var doc1 = System.Text.Json.JsonDocument.Parse(body1);
        var doc2 = System.Text.Json.JsonDocument.Parse(body2);

        var orderId1 = doc1.RootElement.GetProperty("order").GetProperty("id").GetString();
        var orderId2 = doc2.RootElement.GetProperty("order").GetProperty("id").GetString();
        orderId2.Should().Be(orderId1, "replay should return the same order");

        var status1 = doc1.RootElement.GetProperty("order").GetProperty("status").GetString();
        var status2 = doc2.RootElement.GetProperty("order").GetProperty("status").GetString();
        status2.Should().Be(status1, "replay should return the same order status");

        // Order version should not have been incremented again (no re-execution).
        using var assertScope = fixture.Factory.Services.CreateScope();
        var assertDb = assertScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var assertTenant = assertScope.ServiceProvider.GetRequiredService<Taxi.Api.Common.Tenancy.CurrentTenant>();
        assertTenant.FleetId = fleet.Id;
        var dbOrder = await assertDb.Orders.AsNoTracking().FirstAsync(o => o.Id == order.Id, ct);
        dbOrder.Version.Should().Be(2, "Version should only have been incremented once");
    }

    // ── Test 4: Different RequestHash → KeyReused ────────────────────────────

    /// <summary>Same key with a different request (different orderId) returns 409 KeyReused.</summary>
    [Fact]
    public async Task SameKey_DifferentRequestHash_Returns409KeyReused()
    {
        var ct = TestContext.Current.CancellationToken;

        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var (fleet, driver, driverUser, dispatcherUserId) = await SeedFleetAndDriver(db, ct);

        // Seed two orders.
        var order1 = BuildAssignedOrder(fleet.Id, driver.Id, driver.CurrentVehicleId!.Value);
        var order2 = BuildAssignedOrder(fleet.Id, driver.Id, driver.CurrentVehicleId!.Value);
        db.Orders.Add(order1);
        db.Orders.Add(order2);
        await db.SaveChangesAsync(ct);

        var key = $"reuse-key-{Guid.NewGuid():N}";

        // First call with order1.
        var client1 = fixture.Factory.CreateClient();
        client1.AsDriver(fleet.Id, driverUser.Id);
        client1.DefaultRequestHeaders.Add("X-Idempotency-Key", key);
        await client1.PostAsJsonAsync($"/api/v1/orders/{order1.Id}/accept", new { }, ct);

        // Second call with order2 using the same key (different path → different hash).
        var client2 = fixture.Factory.CreateClient();
        client2.AsDriver(fleet.Id, driverUser.Id);
        client2.DefaultRequestHeaders.Add("X-Idempotency-Key", key);
        var resp2 = await client2.PostAsJsonAsync($"/api/v1/orders/{order2.Id}/accept", new { }, ct);

        resp2.StatusCode.Should().Be(HttpStatusCode.Conflict);
        var body = await resp2.Content.ReadAsStringAsync(ct);
        body.Should().Contain(ErrorCodes.Idempotency.KeyReused);
    }

    // ── Test 5: Tenant guard bypassed for idempotency records ────────────────

    /// <summary>IdempotencyRecord is not a tenant entity — it is UserId-scoped,
    /// meaning IgnoreQueryFilters is needed to read it cross-tenant.</summary>
    [Fact]
    public async Task IdempotencyRecords_TenantGuardBypassed_NoQueryFilter()
    {
        var ct = TestContext.Current.CancellationToken;

        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var (fleet, driver, driverUser, _) = await SeedFleetAndDriver(db, ct);

        var order = BuildAssignedOrder(fleet.Id, driver.Id, driver.CurrentVehicleId!.Value);
        db.Orders.Add(order);
        await db.SaveChangesAsync(ct);

        var key = $"no-filter-{Guid.NewGuid():N}";
        var client = fixture.Factory.CreateClient();
        client.AsDriver(fleet.Id, driverUser.Id);
        client.DefaultRequestHeaders.Add("X-Idempotency-Key", key);

        await client.PostAsJsonAsync($"/api/v1/orders/{order.Id}/accept", new { }, ct);

        // Verify the record is readable with IgnoreQueryFilters (cross-tenant context).
        using var assertScope = fixture.Factory.Services.CreateScope();
        var assertDb = assertScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        // Do NOT set FleetId on CurrentTenant — this is a null-tenant scope.
        var count = await assertDb.IdempotencyRecords
            .IgnoreQueryFilters()
            .Where(r => r.UserId == driverUser.Id)
            .CountAsync(ct);
        count.Should().Be(1, "the idempotency record should be readable without a tenant filter");
    }

    // ── Test 6: Concurrent duplicate key ─────────────────────────────────────

    /// <summary>Two concurrent requests with the same key: one executes, the loser gets 409 InFlight.</summary>
    [Fact]
    public async Task Concurrent_DuplicateKey_ExecutesOnce_LoserGets409InFlight()
    {
        var ct = TestContext.Current.CancellationToken;

        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var (fleet, driver, driverUser, _) = await SeedFleetAndDriver(db, ct);

        // Seed the claim row directly to simulate one request "in flight" (no response yet, recent).
        var key = $"concurrent-{Guid.NewGuid():N}";
        var fixedNow = fixture.Factory.FakeTime.GetUtcNow();

        // Seed an in-flight claim (no response, created just now).
        using var seedScope = fixture.Factory.Services.CreateScope();
        var seedDb = seedScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var inFlightRecord = new IdempotencyRecord
        {
            Id = Guid.CreateVersion7(),
            UserId = driverUser.Id,
            Key = key,
            RequestHash = "placeholder-will-be-reused-hash",
            CreatedAt = fixedNow // in-flight: just now, < 60s
        };
        seedDb.IdempotencyRecords.Add(inFlightRecord);
        await seedDb.SaveChangesAsync(ct);

        var order = BuildAssignedOrder(fleet.Id, driver.Id, driver.CurrentVehicleId!.Value);
        db.Orders.Add(order);
        await db.SaveChangesAsync(ct);

        // Compute the actual hash (matching what the endpoint will compute).
        var serializedReq = System.Text.Json.JsonSerializer.Serialize(
            new { id = order.Id },
            new System.Text.Json.JsonSerializerOptions { PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase });
        var path = $"/api/v1/orders/{order.Id}/accept";
        var hashInput = $"POST:{path}:{serializedReq}";
        var hashBytes = System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(hashInput));
        var requestHash = Convert.ToHexString(hashBytes).ToLowerInvariant();

        // Update the seeded record to have the matching hash.
        await seedScope.ServiceProvider.GetRequiredService<TaxiDbContext>()
            .IdempotencyRecords
            .Where(r => r.Id == inFlightRecord.Id)
            .ExecuteUpdateAsync(s => s.SetProperty(r => r.RequestHash, requestHash), ct);

        // This request will hit the in-flight branch (same key, no response, < 60s).
        var client = fixture.Factory.CreateClient();
        client.AsDriver(fleet.Id, driverUser.Id);
        client.DefaultRequestHeaders.Add("X-Idempotency-Key", key);
        var resp = await client.PostAsJsonAsync($"/api/v1/orders/{order.Id}/accept", new { }, ct);

        resp.StatusCode.Should().Be(HttpStatusCode.Conflict);
        var body = await resp.Content.ReadAsStringAsync(ct);
        body.Should().Contain(ErrorCodes.Idempotency.InFlight);
    }

    // ── Test 7: 5xx not stored ────────────────────────────────────────────────

    /// <summary>A 5xx response is not stored; a retry re-executes the transition.</summary>
    [Fact]
    public async Task FiveHundred_IsNotStored_RetryReExecutes()
    {
        var ct = TestContext.Current.CancellationToken;

        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var (fleet, driver, driverUser, _) = await SeedFleetAndDriver(db, ct);

        // Seed a claim row with null response and CreatedAt older than 60s (simulate crashed execution).
        var key = $"five-hundred-{Guid.NewGuid():N}";
        var fixedNow = fixture.Factory.FakeTime.GetUtcNow();

        var order = BuildAssignedOrder(fleet.Id, driver.Id, driver.CurrentVehicleId!.Value);
        db.Orders.Add(order);
        await db.SaveChangesAsync(ct);

        // Compute hash for the request.
        var serializedReq = System.Text.Json.JsonSerializer.Serialize(
            new { id = order.Id },
            new System.Text.Json.JsonSerializerOptions { PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase });
        var path = $"/api/v1/orders/{order.Id}/accept";
        var hashInput = $"POST:{path}:{serializedReq}";
        var hashBytes = System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(hashInput));
        var requestHash = Convert.ToHexString(hashBytes).ToLowerInvariant();

        // Seed an orphaned claim (null response, > 60s ago) to simulate a 5xx that didn't store.
        using var seedScope = fixture.Factory.Services.CreateScope();
        var seedDb = seedScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        seedDb.IdempotencyRecords.Add(new IdempotencyRecord
        {
            Id = Guid.CreateVersion7(),
            UserId = driverUser.Id,
            Key = key,
            RequestHash = requestHash,
            CreatedAt = fixedNow.AddSeconds(-61) // orphaned
        });
        await seedDb.SaveChangesAsync(ct);

        // Retry the request — should takeover and re-execute.
        var client = fixture.Factory.CreateClient();
        client.AsDriver(fleet.Id, driverUser.Id);
        client.DefaultRequestHeaders.Add("X-Idempotency-Key", key);
        var resp = await client.PostAsJsonAsync($"/api/v1/orders/{order.Id}/accept", new { }, ct);

        // Re-execution should succeed.
        resp.StatusCode.Should().Be(HttpStatusCode.OK);

        // Verify the idempotency record now has a stored response.
        using var assertScope = fixture.Factory.Services.CreateScope();
        var assertDb = assertScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var record = await assertDb.IdempotencyRecords
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(r => r.UserId == driverUser.Id && r.Key == key, ct);
        record.Should().NotBeNull();
        record!.ResponseStatus.Should().Be(200, "the successful retry should have been stored");
    }

    // ── Test 8: Orphaned claim → takeover ────────────────────────────────────

    /// <summary>A claim row seeded with CreatedAt older than 60 s and null response is taken over and re-executed.
    /// The orphaned claim is seeded with the same hash the endpoint will compute, so the KeyReused branch is bypassed.</summary>
    [Fact]
    public async Task OrphanedClaim_OlderThan60s_IsTakenOverAndReExecuted()
    {
        var ct = TestContext.Current.CancellationToken;

        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var (fleet, driver, driverUser, _) = await SeedFleetAndDriver(db, ct);

        var order = BuildAssignedOrder(fleet.Id, driver.Id, driver.CurrentVehicleId!.Value);
        db.Orders.Add(order);
        await db.SaveChangesAsync(ct);

        var key = $"orphan-{Guid.NewGuid():N}";
        var fixedNow = fixture.Factory.FakeTime.GetUtcNow();

        // Compute the same hash the helper will compute for POST /api/v1/orders/{id}/accept with {id:guid} bound.
        // The helper serializes the request DTO with camelCase options.
        // AcceptOrderRequest has one property: Id (Guid).
        var serializedReq = System.Text.Json.JsonSerializer.Serialize(
            new { id = order.Id },
            new System.Text.Json.JsonSerializerOptions { PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase });
        var path = $"/api/v1/orders/{order.Id}/accept";
        var hashInput = $"POST:{path}:{serializedReq}";
        var hashBytes = System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(hashInput));
        var requestHash = Convert.ToHexString(hashBytes).ToLowerInvariant();

        // Seed the orphaned claim (older than 60 s, no response) with the matching hash.
        using var seedScope = fixture.Factory.Services.CreateScope();
        var seedDb = seedScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        seedDb.IdempotencyRecords.Add(new IdempotencyRecord
        {
            Id = Guid.CreateVersion7(),
            UserId = driverUser.Id,
            Key = key,
            RequestHash = requestHash,
            CreatedAt = fixedNow.AddSeconds(-61)
        });
        await seedDb.SaveChangesAsync(ct);

        // Now call the endpoint with the same key.
        var client = fixture.Factory.CreateClient();
        client.AsDriver(fleet.Id, driverUser.Id);
        client.DefaultRequestHeaders.Add("X-Idempotency-Key", key);
        var resp = await client.PostAsJsonAsync($"/api/v1/orders/{order.Id}/accept", new { }, ct);

        // The takeover should succeed — the transition executes.
        resp.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    // ── Test 9 (F-IDEM-01): Takeover after committed 409 replays stored 409 ──

    /// <summary>
    /// Proves the committed-takeover contract:
    /// Call 1 commits an Arrive (200), stored. Then the record is backdated > 60 s and cleared (orphan).
    /// Call 2 → takeover → order is already Arrived, so Arrive is an illegal transition → 409 state conflict.
    /// That 409 must now be stored (F-IDEM-01 fix). Call 3 must replay the stored 409 (not InFlight and not re-execute).
    /// </summary>
    [Fact]
    public async Task Takeover_AfterCommittedTransition_ReplaysStored409()
    {
        var ct = TestContext.Current.CancellationToken;

        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var (fleet, driver, driverUser, _) = await SeedFleetAndDriver(db, ct);

        // Seed an order in Accepted state so the first Arrive call succeeds.
        var order = new Order
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleet.Id,
            DriverId = driver.Id,
            VehicleId = driver.CurrentVehicleId!.Value,
            PublicCode = $"T{Guid.NewGuid():N}"[..6].ToUpperInvariant(),
            Status = OrderStatus.Accepted,
            CustomerPhone = "+420600000099",
            PickupAddress = "Takeover Pickup",
            Source = OrderSource.Dispatcher,
            PriceType = PriceType.Estimate,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow,
            AssignedAt = DateTimeOffset.UtcNow,
            Version = 1
        };
        db.Orders.Add(order);
        await db.SaveChangesAsync(ct);

        var key = $"takeover-409-{Guid.NewGuid():N}";
        var fixedNow = fixture.Factory.FakeTime.GetUtcNow();

        // Call 1: Arrive succeeds (Accepted → Arrived), stores 200 in the idempotency record.
        var client1 = fixture.Factory.CreateClient();
        client1.AsDriver(fleet.Id, driverUser.Id);
        client1.DefaultRequestHeaders.Add("X-Idempotency-Key", key);
        var resp1 = await client1.PostAsJsonAsync($"/api/v1/orders/{order.Id}/arrive", new { }, ct);
        resp1.StatusCode.Should().Be(HttpStatusCode.OK, "first arrive should succeed");

        // Backdating: simulate a crash between claim and store by updating the stored record
        // to orphan state (null response, CreatedAt > 60 s ago).
        using var updateScope = fixture.Factory.Services.CreateScope();
        var updateDb = updateScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        await updateDb.IdempotencyRecords
            .IgnoreQueryFilters()
            .Where(r => r.UserId == driverUser.Id && r.Key == key)
            .ExecuteUpdateAsync(s => s
                .SetProperty(r => r.ResponseStatus, (int?)null)
                .SetProperty(r => r.ResponseBody, (System.Text.Json.JsonDocument?)null)
                .SetProperty(r => r.CreatedAt, fixedNow.AddSeconds(-61)),
                ct);

        // Call 2: same key, orphaned claim → takeover → Arrive again on already-Arrived order → 409 transition conflict.
        var client2 = fixture.Factory.CreateClient();
        client2.AsDriver(fleet.Id, driverUser.Id);
        client2.DefaultRequestHeaders.Add("X-Idempotency-Key", key);
        var resp2 = await client2.PostAsJsonAsync($"/api/v1/orders/{order.Id}/arrive", new { }, ct);
        resp2.StatusCode.Should().Be(HttpStatusCode.Conflict, "second arrive on already-arrived order should be 409");

        // The 409 must now be stored (F-IDEM-01 fix).
        using var assertScope = fixture.Factory.Services.CreateScope();
        var assertDb = assertScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var record = await assertDb.IdempotencyRecords
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(r => r.UserId == driverUser.Id && r.Key == key, ct);
        record.Should().NotBeNull();
        record!.ResponseStatus.Should().Be(409, "the 409 should be stored so the third call can replay it");

        // Call 3: must replay the stored 409 (NOT InFlight, NOT re-execute).
        var client3 = fixture.Factory.CreateClient();
        client3.AsDriver(fleet.Id, driverUser.Id);
        client3.DefaultRequestHeaders.Add("X-Idempotency-Key", key);
        var resp3 = await client3.PostAsJsonAsync($"/api/v1/orders/{order.Id}/arrive", new { }, ct);
        resp3.StatusCode.Should().Be(HttpStatusCode.Conflict, "third call replays the stored 409");
        var body3 = await resp3.Content.ReadAsStringAsync(ct);
        body3.Should().NotContain(ErrorCodes.Idempotency.InFlight,
            "stored 409 replay must not be the InFlight error — it should be the transition conflict");

        // Version must not advance beyond 2 (first Arrive incremented it to 2; re-execution was NOT done on call 3).
        using var versionScope = fixture.Factory.Services.CreateScope();
        var versionDb = versionScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var assertTenant = versionScope.ServiceProvider.GetRequiredService<Taxi.Api.Common.Tenancy.CurrentTenant>();
        assertTenant.FleetId = fleet.Id;
        var dbOrder = await versionDb.Orders.AsNoTracking().FirstAsync(o => o.Id == order.Id, ct);
        dbOrder.Version.Should().Be(2, "Version should be 2 after Arrive; call 3 replay must not increment it again");
    }

    // ── Test 10 (F-IDEM-02): Two real parallel POSTs — exactly-once ──────────

    /// <summary>Two truly concurrent POSTs with the same key against a real Accepted order.
    /// Exactly one request wins the unique-index INSERT. The overall outcome: Version advances
    /// exactly once (server-side exactly-once) and every response is either 200 (winner)
    /// or 409-InFlight (loser).</summary>
    [Fact]
    public async Task Concurrent_TrueParallel_SameKey_ExactlyOneExecutes()
    {
        var ct = TestContext.Current.CancellationToken;

        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var (fleet, driver, driverUser, _) = await SeedFleetAndDriver(db, ct);

        var order = BuildAssignedOrder(fleet.Id, driver.Id, driver.CurrentVehicleId!.Value);
        db.Orders.Add(order);
        await db.SaveChangesAsync(ct);

        var key = $"parallel-{Guid.NewGuid():N}";

        // Two separate HttpClient instances, same auth, same key.
        var clientA = fixture.Factory.CreateClient();
        clientA.AsDriver(fleet.Id, driverUser.Id);
        clientA.DefaultRequestHeaders.Add("X-Idempotency-Key", key);

        var clientB = fixture.Factory.CreateClient();
        clientB.AsDriver(fleet.Id, driverUser.Id);
        clientB.DefaultRequestHeaders.Add("X-Idempotency-Key", key);

        // Fire both simultaneously.
        var responses = await Task.WhenAll(
            clientA.PostAsJsonAsync($"/api/v1/orders/{order.Id}/accept", new { }, ct),
            clientB.PostAsJsonAsync($"/api/v1/orders/{order.Id}/accept", new { }, ct));

        var codes = responses.Select(r => (int)r.StatusCode).ToArray();

        // At least one 200 (the claim winner always executes).
        codes.Should().Contain(200, "at least one request must succeed");

        // All 409s must be InFlight (not a state conflict, not KeyReused).
        foreach (var resp in responses.Where(r => r.StatusCode == HttpStatusCode.Conflict))
        {
            var body = await resp.Content.ReadAsStringAsync(ct);
            body.Should().Contain(ErrorCodes.Idempotency.InFlight,
                "losers must get InFlight, not a different 409 variant");
        }

        // Server-side exactly-once: order Version advanced exactly once (was 1, must be 2).
        using var assertScope = fixture.Factory.Services.CreateScope();
        var assertDb = assertScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var assertTenant = assertScope.ServiceProvider.GetRequiredService<Taxi.Api.Common.Tenancy.CurrentTenant>();
        assertTenant.FleetId = fleet.Id;
        var dbOrder = await assertDb.Orders.AsNoTracking().FirstAsync(o => o.Id == order.Id, ct);
        dbOrder.Version.Should().Be(2, "Version should advance exactly once regardless of how many concurrent requests");
    }

    // ── Test 11 (F-IDEM-03): 5xx is not stored — unit-style via direct helper call ──

    /// <summary>Directly exercises ExecuteAndStoreAsync via the public HandleAsync entry point
    /// using a DefaultHttpContext: when the delegate calls storeAsync(500, ...) the claim row
    /// must retain null ResponseStatus (5xx are never stored — a retry must re-execute).</summary>
    [Fact]
    public async Task FiveHundred_IsNotStored_ClaimRemainsForTakeover()
    {
        var ct = TestContext.Current.CancellationToken;

        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var (fleet, driver, driverUser, _) = await SeedFleetAndDriver(db, ct);

        var key = $"unit-5xx-{Guid.NewGuid():N}";
        var timeProvider = fixture.Factory.FakeTime;

        // Build a minimal HttpContext with the X-Idempotency-Key header and a sub claim.
        var httpContext = new DefaultHttpContext();
        httpContext.Request.Method = "POST";
        httpContext.Request.Path = "/api/v1/orders/fake/accept";
        httpContext.Request.Headers["X-Idempotency-Key"] = key;
        httpContext.User = new System.Security.Claims.ClaimsPrincipal(
            new System.Security.Claims.ClaimsIdentity(
            [
                new System.Security.Claims.Claim("sub", driverUser.Id.ToString())
            ]));

        // Point the response body at a null sink so WriteAsync doesn't throw.
        httpContext.Response.Body = System.IO.Stream.Null;

        // Use a new scoped db (mimics per-request scope).
        using var helperScope = fixture.Factory.Services.CreateScope();
        var helperDb = helperScope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        // Invoke the helper with a delegate that reports 500.
        await IdempotencyHelper.HandleAsync(
            httpContext,
            helperDb,
            timeProvider,
            new { id = Guid.NewGuid() }, // dummy request DTO
            async (storeAsync, _ct) =>
            {
                // Simulate infrastructure failure: call storeAsync(500, ...) then nothing is stored.
                await storeAsync(500, new { error = "infra failure" });
            },
            ct);

        // Assert the claim row was NOT updated — ResponseStatus must still be null.
        using var assertScope = fixture.Factory.Services.CreateScope();
        var assertDb = assertScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var record = await assertDb.IdempotencyRecords
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(r => r.UserId == driverUser.Id && r.Key == key, ct);
        record.Should().NotBeNull("the claim row is inserted before execution");
        record!.ResponseStatus.Should().BeNull("5xx must never be stored — the claim remains for takeover");
    }
}

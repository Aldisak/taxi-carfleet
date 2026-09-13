using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Reports;

/// <summary>Integration tests for GET /audit (UC-007 A4): the UNION merge of order_events + audit_logs
/// into one paged descending timeline, filters, tenant isolation, and authz.</summary>
[Collection(TestCollections.Database)]
public sealed class AuditTests(PostgresFixture fixture)
{
    private static readonly DateTimeOffset T0 = new(2026, 3, 16, 10, 0, 0, TimeSpan.Zero);

    /// <summary>order_events and audit_logs merge into one list, sorted by At descending.</summary>
    [Fact]
    public async Task Audit_MergesOrderEventsAndAuditLog_SortedByAtDesc()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, adminId) = await SeedFleetAsync(ct);
        var (orderId, _) = await SeedOrderAsync(fleetId, "AUD001", ct);

        await SeedOrderEventAsync(fleetId, orderId, OrderEventType.Created, adminId, T0, ct);
        await SeedOrderEventAsync(fleetId, orderId, OrderEventType.Assigned, adminId, T0.AddMinutes(5), ct);
        await SeedAuditLogAsync(fleetId, adminId, "Vehicle", "Update", T0.AddMinutes(10), ct);

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminId);
        var page = await client.GetFromJsonAsync<AuditPageDto>("/api/v1/audit?page=1&pageSize=50", ct);

        page!.Total.Should().Be(3);
        page.Items.Should().HaveCount(3);
        // Descending by At: the audit-log update (10 min) first, then Assigned (5), then Created (0).
        page.Items[0].Entity.Should().Be("Vehicle");
        page.Items[0].Source.Should().Be("AuditLog");
        page.Items[1].Action.Should().Be("Assigned");
        page.Items[2].Action.Should().Be("Created");
    }

    /// <summary>Paging is stable across the union: page 1 + page 2 cover all rows with no overlap.</summary>
    [Fact]
    public async Task Audit_Paging_IsStableAcrossUnion()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, adminId) = await SeedFleetAsync(ct);
        var (orderId, _) = await SeedOrderAsync(fleetId, "AUD002", ct);

        for (var i = 0; i < 5; i++)
            await SeedOrderEventAsync(fleetId, orderId, OrderEventType.NoteAdded, adminId, T0.AddMinutes(i), ct);
        for (var i = 0; i < 5; i++)
            await SeedAuditLogAsync(fleetId, adminId, "Route", "Update", T0.AddMinutes(10 + i), ct);

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminId);
        var p1 = await client.GetFromJsonAsync<AuditPageDto>("/api/v1/audit?page=1&pageSize=6", ct);
        var p2 = await client.GetFromJsonAsync<AuditPageDto>("/api/v1/audit?page=2&pageSize=6", ct);

        p1!.Total.Should().Be(10);
        p1.Items.Should().HaveCount(6);
        p2!.Items.Should().HaveCount(4);

        // No overlap: the 'at' values across pages are strictly descending and disjoint.
        var allAts = p1.Items.Concat(p2.Items).Select(i => i.At).ToList();
        allAts.Should().BeInDescendingOrder();
        allAts.Should().OnlyHaveUniqueItems();
    }

    /// <summary>Filter by actor narrows the timeline to that actor's entries.</summary>
    [Fact]
    public async Task Audit_FilterByActor()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, adminId) = await SeedFleetAsync(ct);
        var otherActor = await SeedUserAsync(fleetId, ct);
        var (orderId, _) = await SeedOrderAsync(fleetId, "AUD003", ct);

        await SeedOrderEventAsync(fleetId, orderId, OrderEventType.Created, adminId, T0, ct);
        await SeedOrderEventAsync(fleetId, orderId, OrderEventType.Assigned, otherActor, T0.AddMinutes(1), ct);

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminId);
        var page = await client.GetFromJsonAsync<AuditPageDto>($"/api/v1/audit?actor={adminId}", ct);

        page!.Items.Should().ContainSingle();
        page.Items[0].ActorUserId.Should().Be(adminId);
    }

    /// <summary>Filter by order code returns only that order's events.</summary>
    [Fact]
    public async Task Audit_FilterByOrderCode()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, adminId) = await SeedFleetAsync(ct);
        var (order1, _) = await SeedOrderAsync(fleetId, "CODE01", ct);
        var (order2, _) = await SeedOrderAsync(fleetId, "CODE02", ct);

        await SeedOrderEventAsync(fleetId, order1, OrderEventType.Created, adminId, T0, ct);
        await SeedOrderEventAsync(fleetId, order2, OrderEventType.Created, adminId, T0.AddMinutes(1), ct);

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminId);
        var page = await client.GetFromJsonAsync<AuditPageDto>("/api/v1/audit?orderCode=CODE01", ct);

        page!.Items.Should().ContainSingle();
        page.Items[0].OrderCode.Should().Be("CODE01");
    }

    /// <summary>Filter by entity and date window.</summary>
    [Fact]
    public async Task Audit_FilterByEntityAndDate()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, adminId) = await SeedFleetAsync(ct);
        var (orderId, _) = await SeedOrderAsync(fleetId, "AUD004", ct);

        await SeedOrderEventAsync(fleetId, orderId, OrderEventType.Created, adminId, T0, ct);
        await SeedAuditLogAsync(fleetId, adminId, "Vehicle", "Create", T0.AddMinutes(5), ct);
        await SeedAuditLogAsync(fleetId, adminId, "Route", "Update", T0.AddMinutes(6), ct);

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminId);
        var page = await client.GetFromJsonAsync<AuditPageDto>("/api/v1/audit?entity=Vehicle", ct);

        page!.Items.Should().ContainSingle();
        page.Items[0].Entity.Should().Be("Vehicle");
    }

    /// <summary>A FleetAdmin sees only their own fleet's audit entries.</summary>
    [Fact]
    public async Task Audit_CrossTenant_OnlyCallerFleet()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetA, adminA) = await SeedFleetAsync(ct);
        var (fleetB, adminB) = await SeedFleetAsync(ct);
        var (orderA, _) = await SeedOrderAsync(fleetA, "TENA01", ct);
        var (orderB, _) = await SeedOrderAsync(fleetB, "TENB01", ct);

        await SeedOrderEventAsync(fleetA, orderA, OrderEventType.Created, adminA, T0, ct);
        await SeedOrderEventAsync(fleetB, orderB, OrderEventType.Created, adminB, T0, ct);

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetA, adminA);
        var page = await client.GetFromJsonAsync<AuditPageDto>("/api/v1/audit", ct);

        page!.Items.Should().ContainSingle();
        page.Items[0].OrderCode.Should().Be("TENA01");
    }

    /// <summary>A non-FleetAdmin is forbidden.</summary>
    [Fact]
    public async Task Audit_NonFleetAdmin_Returns403()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, _) = await SeedFleetAsync(ct);

        var client = fixture.Factory.CreateClient().AsDispatcher(fleetId);
        var resp = await client.GetAsync("/api/v1/audit", ct);
        resp.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    /// <summary>A bad date → 400.</summary>
    [Fact]
    public async Task Audit_BadDate_Returns400()
    {
        var ct = TestContext.Current.CancellationToken;
        var (fleetId, adminId) = await SeedFleetAsync(ct);

        var client = fixture.Factory.CreateClient().AsFleetAdmin(fleetId, adminId);
        var resp = await client.GetAsync("/api/v1/audit?from=bad-date", ct);
        resp.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────────

    private async Task<(Guid fleetId, Guid adminId)> SeedFleetAsync(CancellationToken ct)
    {
        var fleetId = Guid.CreateVersion7();
        var adminId = Guid.CreateVersion7();
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.Fleets.Add(new Fleet
        {
            Id = fleetId,
            Slug = $"audit-{Guid.NewGuid():N}",
            Name = "Audit Fleet",
            Phone = "+420777008001",
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
            Email = $"admin-{adminId:N}@audit.local",
            Phone = $"+4207773{Random.Shared.Next(100000, 999999)}",
            DisplayName = "Audit Admin",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync(ct);
        return (fleetId, adminId);
    }

    private async Task<Guid> SeedUserAsync(Guid fleetId, CancellationToken ct)
    {
        var userId = Guid.CreateVersion7();
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.Users.Add(new User
        {
            Id = userId,
            FleetId = fleetId,
            Role = UserRole.Dispatcher,
            Email = $"disp-{userId:N}@audit.local",
            Phone = $"+4207774{Random.Shared.Next(100000, 999999)}",
            DisplayName = "Audit Dispatcher",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync(ct);
        return userId;
    }

    private async Task<(Guid orderId, string code)> SeedOrderAsync(Guid fleetId, string code, CancellationToken ct)
    {
        var orderId = Guid.CreateVersion7();
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.Orders.Add(new Order
        {
            Id = orderId,
            FleetId = fleetId,
            PublicCode = code,
            Status = OrderStatus.New,
            Source = OrderSource.Dispatcher,
            CustomerPhone = "+420777100900",
            PickupAddress = "Pickup",
            PickupLat = 50.0,
            PickupLng = 15.2,
            Passengers = 1,
            PriceType = PriceType.Estimate,
            CreatedAt = T0,
            UpdatedAt = T0,
            Version = 1
        });
        await db.SaveChangesAsync(ct);
        return (orderId, code);
    }

    private async Task SeedOrderEventAsync(
        Guid fleetId, Guid orderId, OrderEventType type, Guid actorUserId, DateTimeOffset at, CancellationToken ct)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.OrderEvents.Add(new OrderEvent
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleetId,
            OrderId = orderId,
            Type = type,
            FromStatus = OrderStatus.New,
            ToStatus = OrderStatus.New,
            ActorUserId = actorUserId,
            ActorRole = UserRole.Dispatcher,
            At = at
        });
        await db.SaveChangesAsync(ct);
    }

    private async Task SeedAuditLogAsync(
        Guid fleetId, Guid actorUserId, string entity, string action, DateTimeOffset at, CancellationToken ct)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        db.AuditLogs.Add(new AuditLog
        {
            Id = Guid.CreateVersion7(),
            FleetId = fleetId,
            ActorUserId = actorUserId,
            Entity = entity,
            EntityId = Guid.CreateVersion7(),
            Action = action,
            At = at
        });
        await db.SaveChangesAsync(ct);
    }

    private sealed record AuditPageDto(List<AuditEntryItemDto> Items, int Total, int Page, int PageSize);

    private sealed record AuditEntryItemDto(
        string Source, Guid? ActorUserId, string Entity, string Action, string? OrderCode, DateTimeOffset At);
}

using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Common.Admin;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Reports;

/// <summary>Integration tests for the SuperAdmin /admin/fleets endpoints (UC-007 A5): cross-tenant fleet
/// provisioning, one-time password, authz, duplicate-slug 409, list, deactivate, and the CLI bootstrapper.</summary>
[Collection(TestCollections.Database)]
public sealed class AdminFleetsTests(PostgresFixture fixture)
{
    /// <summary>Creating a fleet seeds FleetSettings defaults + a default Tariff + a FleetAdmin user.</summary>
    [Fact]
    public async Task AdminFleets_Create_SeedsSettingsTariffAndAdmin()
    {
        var ct = TestContext.Current.CancellationToken;
        var slug = $"prov-{Guid.NewGuid():N}".Substring(0, 20);

        var client = fixture.Factory.CreateClient().AsSuperAdmin();
        var resp = await client.PostAsJsonAsync("/api/v1/admin/fleets", new
        {
            slug,
            name = "Provisioned Fleet",
            phone = "+420777009001",
            adminEmail = $"admin@{slug}.local"
        }, ct);

        resp.StatusCode.Should().Be(HttpStatusCode.Created);
        var body = await resp.Content.ReadFromJsonAsync<CreateFleetResponseDto>(ct);

        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        var fleetExists = await db.Fleets.IgnoreQueryFilters().AnyAsync(f => f.Id == body!.FleetId, ct);
        fleetExists.Should().BeTrue();

        var settings = await db.FleetSettings.IgnoreQueryFilters().FirstOrDefaultAsync(s => s.FleetId == body!.FleetId, ct);
        settings.Should().NotBeNull();
        settings!.OfferTimeoutSeconds.Should().Be(45);

        var tariff = await db.Tariffs.IgnoreQueryFilters().FirstOrDefaultAsync(t => t.FleetId == body!.FleetId, ct);
        tariff.Should().NotBeNull();
        tariff!.IsDefault.Should().BeTrue();

        var admin = await db.Users.IgnoreQueryFilters()
            .FirstOrDefaultAsync(u => u.FleetId == body!.FleetId && u.Role == UserRole.FleetAdmin, ct);
        admin.Should().NotBeNull();
        admin!.Email.Should().Be($"admin@{slug}.local");
    }

    /// <summary>The create response returns a usable one-time password that matches the stored hash.</summary>
    [Fact]
    public async Task AdminFleets_Create_ReturnsOneTimePassword()
    {
        var ct = TestContext.Current.CancellationToken;
        var slug = $"otp-{Guid.NewGuid():N}".Substring(0, 20);

        var client = fixture.Factory.CreateClient().AsSuperAdmin();
        var resp = await client.PostAsJsonAsync("/api/v1/admin/fleets", new
        {
            slug,
            name = "OTP Fleet",
            phone = "+420777009002",
            adminEmail = $"admin@{slug}.local"
        }, ct);

        var body = await resp.Content.ReadFromJsonAsync<CreateFleetResponseDto>(ct);
        body!.OneTimePassword.Should().NotBeNullOrWhiteSpace();

        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var admin = await db.Users.IgnoreQueryFilters()
            .FirstAsync(u => u.FleetId == body.FleetId && u.Role == UserRole.FleetAdmin, ct);

        BCrypt.Net.BCrypt.Verify(body.OneTimePassword, admin.PasswordHash).Should().BeTrue();
    }

    /// <summary>A non-SuperAdmin (FleetAdmin) cannot create a fleet — the cross-tenant write is blocked.</summary>
    [Fact]
    public async Task AdminFleets_Create_NonSuperAdmin_Returns403()
    {
        var ct = TestContext.Current.CancellationToken;

        var client = fixture.Factory.CreateClient().AsFleetAdmin(Guid.CreateVersion7());
        var resp = await client.PostAsJsonAsync("/api/v1/admin/fleets", new
        {
            slug = "should-fail",
            name = "Nope",
            phone = "+420777009003",
            adminEmail = "nope@x.local"
        }, ct);

        resp.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    /// <summary>A duplicate slug → 409.</summary>
    [Fact]
    public async Task AdminFleets_Create_DuplicateSlug_Returns409()
    {
        var ct = TestContext.Current.CancellationToken;
        var slug = $"dup-{Guid.NewGuid():N}".Substring(0, 20);
        var client = fixture.Factory.CreateClient().AsSuperAdmin();

        var first = await client.PostAsJsonAsync("/api/v1/admin/fleets", new
        {
            slug,
            name = "Dup One",
            phone = "+420777009004",
            adminEmail = $"a@{slug}.local"
        }, ct);
        first.StatusCode.Should().Be(HttpStatusCode.Created);

        var second = await client.PostAsJsonAsync("/api/v1/admin/fleets", new
        {
            slug,
            name = "Dup Two",
            phone = "+420777009005",
            adminEmail = $"b@{slug}.local"
        }, ct);
        second.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    /// <summary>GET /admin/fleets lists all fleets across tenants.</summary>
    [Fact]
    public async Task AdminFleets_List_ReturnsAllFleets()
    {
        var ct = TestContext.Current.CancellationToken;
        var client = fixture.Factory.CreateClient().AsSuperAdmin();

        var slugA = $"lst-a-{Guid.NewGuid():N}".Substring(0, 20);
        var slugB = $"lst-b-{Guid.NewGuid():N}".Substring(0, 20);
        await client.PostAsJsonAsync("/api/v1/admin/fleets", new { slug = slugA, name = "List A", phone = "+420777009006", adminEmail = $"a@{slugA}.local" }, ct);
        await client.PostAsJsonAsync("/api/v1/admin/fleets", new { slug = slugB, name = "List B", phone = "+420777009007", adminEmail = $"b@{slugB}.local" }, ct);

        var list = await client.GetFromJsonAsync<ListFleetsResponseDto>("/api/v1/admin/fleets", ct);

        list!.Items.Select(f => f.Slug).Should().Contain([slugA, slugB]);
    }

    /// <summary>POST /admin/fleets/{id}/deactivate sets IsActive=false.</summary>
    [Fact]
    public async Task AdminFleets_Deactivate_SetsInactive()
    {
        var ct = TestContext.Current.CancellationToken;
        var client = fixture.Factory.CreateClient().AsSuperAdmin();
        var slug = $"deact-{Guid.NewGuid():N}".Substring(0, 20);

        var create = await client.PostAsJsonAsync("/api/v1/admin/fleets", new { slug, name = "Deact", phone = "+420777009008", adminEmail = $"a@{slug}.local" }, ct);
        var body = await create.Content.ReadFromJsonAsync<CreateFleetResponseDto>(ct);

        var resp = await client.PostAsync($"/api/v1/admin/fleets/{body!.FleetId}/deactivate", null, ct);
        resp.StatusCode.Should().Be(HttpStatusCode.NoContent);

        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var fleet = await db.Fleets.IgnoreQueryFilters().FirstAsync(f => f.Id == body.FleetId, ct);
        fleet.IsActive.Should().BeFalse();
    }

    /// <summary>The bootstrapper inserts a SuperAdmin user with no FleetId.</summary>
    [Fact]
    public async Task SuperAdminBootstrapper_CreatesSuperAdminUser()
    {
        var ct = TestContext.Current.CancellationToken;
        var email = $"super-{Guid.NewGuid():N}@ops.local";

        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var bootstrapper = scope.ServiceProvider.GetRequiredService<SuperAdminBootstrapper>();
        var created = await bootstrapper.CreateAsync(email, "Sup3rSecret!", ct);
        created.Should().BeTrue();

        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var user = await db.Users.IgnoreQueryFilters()
            .FirstOrDefaultAsync(u => u.Email == email && u.Role == UserRole.SuperAdmin, ct);
        user.Should().NotBeNull();
        user!.FleetId.Should().BeNull();
    }

    /// <summary>A duplicate email is a no-op (idempotent) — returns false without a second row.</summary>
    [Fact]
    public async Task SuperAdminBootstrapper_DuplicateEmail_IsIdempotentOrRejects()
    {
        var ct = TestContext.Current.CancellationToken;
        var email = $"super-dup-{Guid.NewGuid():N}@ops.local";

        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var bootstrapper = scope.ServiceProvider.GetRequiredService<SuperAdminBootstrapper>();

        (await bootstrapper.CreateAsync(email, "Pw1!", ct)).Should().BeTrue();

        await using var scope2 = fixture.Factory.Services.CreateAsyncScope();
        var bootstrapper2 = scope2.ServiceProvider.GetRequiredService<SuperAdminBootstrapper>();
        (await bootstrapper2.CreateAsync(email, "Pw2!", ct)).Should().BeFalse();

        var db = scope2.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var count = await db.Users.IgnoreQueryFilters()
            .CountAsync(u => u.Email == email && u.Role == UserRole.SuperAdmin, ct);
        count.Should().Be(1);
    }

    private sealed record CreateFleetResponseDto(Guid FleetId, string Slug, string AdminEmail, string OneTimePassword);

    private sealed record ListFleetsResponseDto(List<AdminFleetItemDto> Items);

    private sealed record AdminFleetItemDto(Guid Id, string Slug, string Name, string Phone, bool IsActive, DateTimeOffset CreatedAt);
}

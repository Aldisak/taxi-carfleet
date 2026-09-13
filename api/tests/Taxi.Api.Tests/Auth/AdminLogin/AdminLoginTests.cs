using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Common.Admin;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Tests.Infrastructure;
using Taxi.Api.Tests.Seed;

namespace Taxi.Api.Tests.Auth.AdminLogin;

/// <summary>Integration tests for the fleetless SuperAdmin login endpoint (UC-007 AC#3):
/// <c>POST /api/v1/auth/admin/login</c>. A CLI-provisioned SuperAdmin (Role=SuperAdmin, FleetId=null)
/// must be able to obtain a JWT that passes the SuperAdminOnly policy on <c>/admin/fleets</c>.</summary>
[Collection(TestCollections.Database)]
public sealed class AdminLoginTests(PostgresFixture fixture)
{
    /// <summary>A CLI-provisioned SuperAdmin can log in and receives a JWT whose role claim is
    /// SuperAdmin and which carries NO fleet_id claim. Seeded via the real bootstrapper so the
    /// true CLI → login path is exercised (casing / IsActive mismatch would surface here).</summary>
    [Fact]
    public async Task AdminLogin_ValidSuperAdmin_Returns200WithFleetlessToken()
    {
        var ct = TestContext.Current.CancellationToken;
        var email = $"super-{Guid.NewGuid():N}@ops.local";
        const string password = "Sup3rSecret!";

        await using (var scope = fixture.Factory.Services.CreateAsyncScope())
        {
            var bootstrapper = scope.ServiceProvider.GetRequiredService<SuperAdminBootstrapper>();
            (await bootstrapper.CreateAsync(email, password, ct)).Should().BeTrue();
        }

        using var client = fixture.Factory.CreateClient();
        var resp = await client.PostAsJsonAsync(
            "/api/v1/auth/admin/login",
            new { email, password },
            ct);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await resp.Content.ReadFromJsonAsync<JsonElement>(ct);
        var accessToken = body.GetProperty("accessToken").GetString();
        accessToken.Should().NotBeNullOrEmpty();
        body.GetProperty("refreshToken").GetString().Should().NotBeNullOrEmpty();
        var userObj = body.GetProperty("user");
        userObj.GetProperty("email").GetString().Should().Be(email);
        userObj.GetProperty("role").GetString().Should().Be("SuperAdmin");

        // Decode the minted token — never replay it (FakeTimeProvider clock trap, CLAUDE.md WI-05).
        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(accessToken);
        jwt.Claims.Should().Contain(c => c.Type == "role" && c.Value == "SuperAdmin");
        jwt.Claims.Should().NotContain(c => c.Type == TenantClaims.FleetId);
        jwt.Claims.Should().NotContain(c => c.Type == TenantClaims.FleetSlug);
    }

    /// <summary>A wrong password returns 401 without leaking which part was wrong.</summary>
    [Fact]
    public async Task AdminLogin_WrongPassword_Returns401()
    {
        var ct = TestContext.Current.CancellationToken;
        var email = $"super-{Guid.NewGuid():N}@ops.local";

        await using (var scope = fixture.Factory.Services.CreateAsyncScope())
        {
            var bootstrapper = scope.ServiceProvider.GetRequiredService<SuperAdminBootstrapper>();
            (await bootstrapper.CreateAsync(email, "CorrectPassword1!", ct)).Should().BeTrue();
        }

        using var client = fixture.Factory.CreateClient();
        var resp = await client.PostAsJsonAsync(
            "/api/v1/auth/admin/login",
            new { email, password = "WrongPassword1!" },
            ct);

        resp.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    /// <summary>An unknown email returns 401 (uniform, no enumeration oracle).</summary>
    [Fact]
    public async Task AdminLogin_UnknownEmail_Returns401()
    {
        var ct = TestContext.Current.CancellationToken;

        using var client = fixture.Factory.CreateClient();
        var resp = await client.PostAsJsonAsync(
            "/api/v1/auth/admin/login",
            new { email = $"nobody-{Guid.NewGuid():N}@ops.local", password = "AnyPassword1!" },
            ct);

        resp.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    /// <summary>A FleetAdmin email (not a SuperAdmin, has a FleetId) returns 401 — this endpoint is
    /// SuperAdmin-only; fleet staff must use /auth/staff/login.</summary>
    [Fact]
    public async Task AdminLogin_FleetAdminEmail_Returns401()
    {
        var ct = TestContext.Current.CancellationToken;
        var email = $"fleetadmin-{Guid.NewGuid():N}@fleet.local";
        const string password = "FleetAdmin1!";

        await using (var scope = fixture.Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
            var fleetId = Guid.CreateVersion7();
            db.Fleets.Add(new Fleet
            {
                Id = fleetId,
                Slug = $"al-{Guid.NewGuid():N}".Substring(0, 20),
                Name = "AdminLogin Fleet",
                Phone = "+420777012001",
                Currency = "CZK",
                TimeZone = "Europe/Prague",
                IsActive = true,
                CreatedAt = DateTimeOffset.UtcNow
            });
            db.Users.Add(new User
            {
                Id = Guid.CreateVersion7(),
                FleetId = fleetId,
                Role = UserRole.FleetAdmin,
                Email = email,
                Phone = "+420777012002",
                DisplayName = "Fleet Admin",
                IsActive = true,
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(password, workFactor: 11),
                CreatedAt = DateTimeOffset.UtcNow
            });
            await db.SaveChangesAsync(ct);
        }

        using var client = fixture.Factory.CreateClient();
        var resp = await client.PostAsJsonAsync(
            "/api/v1/auth/admin/login",
            new { email, password },
            ct);

        resp.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    /// <summary>End-to-end-ish: a SuperAdmin token minted by the login endpoint actually PASSES the
    /// SuperAdminOnly policy on GET /admin/fleets. Uses the E2E factory's LifetimeValidator clock
    /// workaround so the JwtIssuer-minted (FakeTimeProvider) token is accepted by JwtBearer.</summary>
    [Fact]
    public async Task AdminLogin_TokenPassesSuperAdminPolicyOnAdminFleets()
    {
        var ct = TestContext.Current.CancellationToken;
        var email = $"super-{Guid.NewGuid():N}@ops.local";
        const string password = "Sup3rSecret!";

        await using (var scope = fixture.Factory.Services.CreateAsyncScope())
        {
            var bootstrapper = scope.ServiceProvider.GetRequiredService<SuperAdminBootstrapper>();
            (await bootstrapper.CreateAsync(email, password, ct)).Should().BeTrue();
        }

        await using var e2eFactory = new E2ETaxiApiFactory(fixture.ConnectionString);
        var client = e2eFactory.CreateClient();

        var loginResp = await client.PostAsJsonAsync(
            "/api/v1/auth/admin/login",
            new { email, password },
            ct);
        loginResp.StatusCode.Should().Be(HttpStatusCode.OK, "super-admin login must succeed");

        var loginBody = await loginResp.Content.ReadFromJsonAsync<JsonElement>(ct);
        var accessToken = loginBody.GetProperty("accessToken").GetString()!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        var fleetsResp = await client.GetAsync("/api/v1/admin/fleets", ct);
        fleetsResp.StatusCode.Should().Be(HttpStatusCode.OK, "the minted SuperAdmin token must pass SuperAdminOnly");
    }
}

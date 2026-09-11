using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Auth.Staff;

/// <summary>Integration tests for staff authentication: login, refresh-token rotation, and logout.</summary>
[Collection(TestCollections.Database)]
public sealed class StaffAuthTests(PostgresFixture fixture)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    // ── Seed helpers ──────────────────────────────────────────────────────────

    private static Fleet BuildFleet(string slug, bool isActive = true) => new()
    {
        Id = Guid.CreateVersion7(),
        Slug = slug,
        Name = $"Fleet {slug}",
        Phone = "+420777000099",
        Currency = "CZK",
        TimeZone = "Europe/Prague",
        IsActive = isActive,
        CreatedAt = DateTimeOffset.UtcNow
    };

    private static User BuildStaffUser(Guid fleetId, string email, string phone, UserRole role, string passwordHash) => new()
    {
        Id = Guid.CreateVersion7(),
        FleetId = fleetId,
        Role = role,
        Email = email,
        Phone = phone,
        DisplayName = $"Test {role}",
        IsActive = true,
        PasswordHash = passwordHash,
        CreatedAt = DateTimeOffset.UtcNow
    };

    private async Task<(Fleet fleet, User user)> SeedFleetAndUser(
        string slugSuffix,
        UserRole role = UserRole.Dispatcher,
        string? overrideEmail = null,
        bool fleetIsActive = true,
        CancellationToken ct = default)
    {
        var slug = $"auth-test-{slugSuffix}";
        var email = overrideEmail ?? $"staff-{slugSuffix}@test.local";
        var phone = $"+420{Math.Abs(slugSuffix.GetHashCode()) % 900000000 + 100000000}";
        var hash = BCrypt.Net.BCrypt.HashPassword("Password123!");

        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        var fleet = BuildFleet(slug, fleetIsActive);
        var user = BuildStaffUser(fleet.Id, email, phone, role, hash);

        db.Fleets.Add(fleet);
        await db.SaveChangesAsync(ct);
        db.Users.Add(user);
        await db.SaveChangesAsync(ct);

        return (fleet, user);
    }

    // ── Test 1: Valid credentials return tokens ───────────────────────────────

    /// <summary>Verifies that valid credentials return access and refresh tokens with user info.</summary>
    [Fact]
    public async Task StaffLogin_ValidCredentials_ReturnsTokens()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var (fleet, user) = await SeedFleetAndUser(suffix, ct: ct);

        using var client = fixture.Factory.CreateClient();
        var response = await client.PostAsJsonAsync(
            "api/v1/auth/staff/login",
            new { fleetSlug = fleet.Slug, email = user.Email, password = "Password123!" },
            ct);

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
        body.GetProperty("accessToken").GetString().Should().NotBeNullOrEmpty();
        body.GetProperty("refreshToken").GetString().Should().NotBeNullOrEmpty();
        var userObj = body.GetProperty("user");
        userObj.GetProperty("id").GetString().Should().Be(user.Id.ToString());
        userObj.GetProperty("email").GetString().Should().Be(user.Email);
    }

    // ── Test 2: Wrong password returns 401 ───────────────────────────────────

    /// <summary>Verifies that a wrong password returns 401 Unauthorized without leaking details.</summary>
    [Fact]
    public async Task StaffLogin_WrongPassword_Returns401()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var (fleet, user) = await SeedFleetAndUser(suffix, ct: ct);

        using var client = fixture.Factory.CreateClient();
        var response = await client.PostAsJsonAsync(
            "api/v1/auth/staff/login",
            new { fleetSlug = fleet.Slug, email = user.Email, password = "WrongPassword!" },
            ct);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    // ── Test 3: Unknown fleet slug returns 401 ────────────────────────────────

    /// <summary>Verifies that an unknown fleet slug returns 401 without leaking existence info.</summary>
    [Fact]
    public async Task StaffLogin_UnknownFleetSlug_Returns401()
    {
        var ct = TestContext.Current.CancellationToken;

        using var client = fixture.Factory.CreateClient();
        var response = await client.PostAsJsonAsync(
            "api/v1/auth/staff/login",
            new { fleetSlug = "no-such-fleet-xyz", email = "someone@test.local", password = "SomePassword1!" },
            ct);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    // ── Test 4: Refresh rotates and returns new pair ──────────────────────────

    /// <summary>Verifies that a valid refresh token rotates: old token revoked, new pair issued.</summary>
    [Fact]
    public async Task Refresh_ValidToken_RotatesAndReturnsNewPair()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var (fleet, user) = await SeedFleetAndUser(suffix, ct: ct);

        using var client = fixture.Factory.CreateClient();

        // Login to get initial tokens
        var loginResp = await client.PostAsJsonAsync(
            "api/v1/auth/staff/login",
            new { fleetSlug = fleet.Slug, email = user.Email, password = "Password123!" },
            ct);
        loginResp.StatusCode.Should().Be(HttpStatusCode.OK);

        var loginBody = await loginResp.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
        var originalRefreshToken = loginBody.GetProperty("refreshToken").GetString()!;

        // Refresh
        var refreshResp = await client.PostAsJsonAsync(
            "api/v1/auth/refresh",
            new { refreshToken = originalRefreshToken },
            ct);
        refreshResp.StatusCode.Should().Be(HttpStatusCode.OK);

        var refreshBody = await refreshResp.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
        var newAccessToken = refreshBody.GetProperty("accessToken").GetString();
        var newRefreshToken = refreshBody.GetProperty("refreshToken").GetString();

        newAccessToken.Should().NotBeNullOrEmpty();
        newRefreshToken.Should().NotBeNullOrEmpty();
        newRefreshToken.Should().NotBe(originalRefreshToken);
    }

    // ── Test 5: Reuse of revoked token returns 401 ────────────────────────────

    /// <summary>Verifies that reusing a revoked refresh token returns 401.</summary>
    [Fact]
    public async Task Refresh_ReusedRevokedToken_Returns401()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var (fleet, user) = await SeedFleetAndUser(suffix, ct: ct);

        using var client = fixture.Factory.CreateClient();

        // Login
        var loginResp = await client.PostAsJsonAsync(
            "api/v1/auth/staff/login",
            new { fleetSlug = fleet.Slug, email = user.Email, password = "Password123!" },
            ct);
        var loginBody = await loginResp.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
        var originalRefreshToken = loginBody.GetProperty("refreshToken").GetString()!;

        // First refresh (revokes the original)
        var firstRefreshResp = await client.PostAsJsonAsync(
            "api/v1/auth/refresh",
            new { refreshToken = originalRefreshToken },
            ct);
        firstRefreshResp.StatusCode.Should().Be(HttpStatusCode.OK);

        // Attempt to reuse the already-revoked token
        var secondRefreshResp = await client.PostAsJsonAsync(
            "api/v1/auth/refresh",
            new { refreshToken = originalRefreshToken },
            ct);
        secondRefreshResp.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    // ── Test 6: Logout revokes the refresh token ──────────────────────────────

    /// <summary>Verifies that logout revokes the refresh token so it cannot be used again.</summary>
    [Fact]
    public async Task Logout_RevokesRefreshToken()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var (fleet, user) = await SeedFleetAndUser(suffix, ct: ct);

        using var client = fixture.Factory.CreateClient();

        // Login to obtain the refresh token we want to revoke.
        var loginResp = await client.PostAsJsonAsync(
            "api/v1/auth/staff/login",
            new { fleetSlug = fleet.Slug, email = user.Email, password = "Password123!" },
            ct);
        var loginBody = await loginResp.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
        var refreshToken = loginBody.GetProperty("refreshToken").GetString()!;

        // Use AuthHelpers to mint a long-lived bearer token for the logout request
        // (avoids relying on the short-lived FakeTimeProvider-minted access token).
        client.AsDispatcher(fleet.Id, user.Id, fleet.Slug);
        var logoutResp = await client.PostAsJsonAsync(
            "api/v1/auth/logout",
            new { refreshToken },
            ct);
        logoutResp.StatusCode.Should().Be(HttpStatusCode.NoContent);

        // Attempt to refresh after logout — should be rejected.
        client.DefaultRequestHeaders.Authorization = null;
        var refreshAfterLogout = await client.PostAsJsonAsync(
            "api/v1/auth/refresh",
            new { refreshToken },
            ct);
        refreshAfterLogout.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    // ── Test 7: Inactive fleet blocks login ───────────────────────────────────

    /// <summary>Verifies that a staff member of an inactive fleet cannot log in (uniform 401).</summary>
    [Fact]
    public async Task StaffLogin_InactiveFleet_Returns401()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var (fleet, user) = await SeedFleetAndUser(suffix, fleetIsActive: false, ct: ct);

        using var client = fixture.Factory.CreateClient();
        var response = await client.PostAsJsonAsync(
            "api/v1/auth/staff/login",
            new { fleetSlug = fleet.Slug, email = user.Email, password = "Password123!" },
            ct);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    // ── Test 8: Inactive fleet blocks refresh ────────────────────────────────

    /// <summary>Verifies that refreshing a token when the owning fleet is inactive returns 401.</summary>
    [Fact]
    public async Task Refresh_InactiveFleet_Returns401()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];

        // Seed active fleet + user and login to obtain a refresh token.
        var (fleet, user) = await SeedFleetAndUser(suffix, ct: ct);

        using var client = fixture.Factory.CreateClient();
        var loginResp = await client.PostAsJsonAsync(
            "api/v1/auth/staff/login",
            new { fleetSlug = fleet.Slug, email = user.Email, password = "Password123!" },
            ct);
        loginResp.StatusCode.Should().Be(HttpStatusCode.OK);
        var loginBody = await loginResp.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
        var refreshToken = loginBody.GetProperty("refreshToken").GetString()!;

        // Deactivate the fleet.
        await using (var scope = fixture.Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
            await db.Fleets
                .Where(f => f.Id == fleet.Id)
                .ExecuteUpdateAsync(s => s.SetProperty(f => f.IsActive, false), ct);
        }

        // Attempt refresh — fleet is now inactive.
        var refreshResp = await client.PostAsJsonAsync(
            "api/v1/auth/refresh",
            new { refreshToken },
            ct);

        refreshResp.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    // ── Test 9: Concurrent refresh with same token — only one succeeds ────────

    /// <summary>Verifies that two concurrent refresh requests with the same token yield exactly one 200 and one 401.</summary>
    [Fact]
    public async Task Refresh_ConcurrentSameToken_OnlyOneSucceeds()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var (fleet, user) = await SeedFleetAndUser(suffix, ct: ct);

        using var client1 = fixture.Factory.CreateClient();
        using var client2 = fixture.Factory.CreateClient();

        // Login to get a refresh token.
        var loginResp = await client1.PostAsJsonAsync(
            "api/v1/auth/staff/login",
            new { fleetSlug = fleet.Slug, email = user.Email, password = "Password123!" },
            ct);
        loginResp.StatusCode.Should().Be(HttpStatusCode.OK);
        var loginBody = await loginResp.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
        var refreshToken = loginBody.GetProperty("refreshToken").GetString()!;

        // Fire two concurrent refreshes with the same token.
        var task1 = client1.PostAsJsonAsync("api/v1/auth/refresh", new { refreshToken }, ct);
        var task2 = client2.PostAsJsonAsync("api/v1/auth/refresh", new { refreshToken }, ct);
        var results = await Task.WhenAll(task1, task2);

        var statuses = results.Select(r => r.StatusCode).ToList();
        statuses.Should().ContainSingle(s => s == HttpStatusCode.OK);
        statuses.Should().ContainSingle(s => s == HttpStatusCode.Unauthorized);
    }
}

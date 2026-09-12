using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Logging;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Staff.ResetPassword;

/// <summary>Integration tests for POST /staff/{id}/reset-password (A4).</summary>
[Collection(TestCollections.Database)]
public sealed class ResetPasswordTests(PostgresFixture fixture)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    // ── Seed helpers ──────────────────────────────────────────────────────────

    private static Fleet BuildFleet(string slugSuffix) => new()
    {
        Id = Guid.CreateVersion7(),
        Slug = $"rp-{slugSuffix}",
        Name = $"Reset Password Test Fleet {slugSuffix}",
        Phone = "+420603900001",
        Currency = "CZK",
        TimeZone = "Europe/Prague",
        IsActive = true,
        CreatedAt = DateTimeOffset.UtcNow
    };

    private static User BuildFleetAdmin(Guid fleetId, string phoneSuffix) => new()
    {
        Id = Guid.CreateVersion7(),
        FleetId = fleetId,
        Role = UserRole.FleetAdmin,
        Email = $"admin-{phoneSuffix}@rp-test.local",
        Phone = $"+420710{phoneSuffix}",
        DisplayName = "Fleet Admin",
        PasswordHash = BCrypt.Net.BCrypt.HashPassword("InitialPass123!"),
        IsActive = true,
        CreatedAt = DateTimeOffset.UtcNow
    };

    private static User BuildStaffUser(Guid fleetId, string phoneSuffix, UserRole role = UserRole.Dispatcher) => new()
    {
        Id = Guid.CreateVersion7(),
        FleetId = fleetId,
        Role = role,
        Email = $"staff-{phoneSuffix}@rp-test.local",
        Phone = $"+420720{phoneSuffix}",
        DisplayName = "Test Staff",
        PasswordHash = BCrypt.Net.BCrypt.HashPassword("OldPass123!"),
        IsActive = true,
        CreatedAt = DateTimeOffset.UtcNow
    };

    private async Task<(Fleet fleet, User admin, User targetUser)> SeedScenario(string suffix)
    {
        var ct = TestContext.Current.CancellationToken;
        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        var fleet = BuildFleet(suffix);
        var admin = BuildFleetAdmin(fleet.Id, suffix[..6]);
        var targetUser = BuildStaffUser(fleet.Id, suffix[..6]);

        db.Fleets.Add(fleet);
        db.Users.Add(admin);
        db.Users.Add(targetUser);
        await db.SaveChangesAsync(ct);

        return (fleet, admin, targetUser);
    }

    // ── Happy path ─────────────────────────────────────────────────────────────

    /// <summary>Reset password returns the new temporary plaintext password exactly once and updates the hash.
    /// Also asserts the plaintext password is never emitted to any log sink.</summary>
    [Fact]
    public async Task ResetPassword_ReturnsNewTempPasswordOnce_AndUpdatesHash()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..6];
        var (fleet, admin, targetUser) = await SeedScenario(suffix);

        // Capture all log messages produced during this request to assert the plaintext is not logged.
        var logCapture = new LogCapture();
        using var localFactory = fixture.Factory.WithWebHostBuilder(b =>
            b.ConfigureLogging(lb => lb.AddProvider(logCapture)));

        var client = localFactory.CreateClient();
        client.AsFleetAdmin(fleet.Id, admin.Id);

        var resp = await client.PostAsync($"api/v1/staff/{targetUser.Id}/reset-password", null, ct);
        resp.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await resp.Content.ReadFromJsonAsync<ResetPasswordResponse>(JsonOptions, ct);
        body.Should().NotBeNull();
        body!.TemporaryPassword.Should().NotBeNullOrEmpty();
        body.TemporaryPassword.Should().HaveLength(16);

        // The plaintext password MUST NOT appear in any log entry.
        logCapture.Messages.Should().NotContain(m => m.Contains(body.TemporaryPassword),
            because: "the temporary password must never be written to logs");

        // Verify the new hash verifies against the returned plaintext.
        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        var updatedUser = await db.Users.IgnoreQueryFilters().FirstAsync(u => u.Id == targetUser.Id, ct);
        BCrypt.Net.BCrypt.Verify(body.TemporaryPassword, updatedUser.PasswordHash).Should().BeTrue();
    }

    // ── Cross-tenant ──────────────────────────────────────────────────────────

    /// <summary>Reset password for a user in another fleet returns 404 (no-leak).</summary>
    [Fact]
    public async Task ResetPassword_CrossTenantUser_Returns404()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffixA = Guid.NewGuid().ToString("N")[..6];
        var suffixB = Guid.NewGuid().ToString("N")[..6];

        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        var fleetA = BuildFleet(suffixA + "a");
        var fleetB = BuildFleet(suffixB + "b");
        var adminB = BuildFleetAdmin(fleetB.Id, suffixB[..6]);
        var userInFleetA = BuildStaffUser(fleetA.Id, suffixA[..6]);

        db.Fleets.Add(fleetA);
        db.Fleets.Add(fleetB);
        db.Users.Add(adminB);
        db.Users.Add(userInFleetA);
        await db.SaveChangesAsync(ct);

        var client = fixture.Factory.CreateClient();
        client.AsFleetAdmin(fleetB.Id, adminB.Id);

        var resp = await client.PostAsync($"api/v1/staff/{userInFleetA.Id}/reset-password", null, ct);
        resp.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    // ── Authorization ─────────────────────────────────────────────────────────

    /// <summary>Non-FleetAdmin (e.g. Dispatcher) gets 403 when calling reset-password.</summary>
    [Fact]
    public async Task ResetPassword_NonFleetAdmin_Returns403()
    {
        var ct = TestContext.Current.CancellationToken;
        var suffix = Guid.NewGuid().ToString("N")[..6];

        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TaxiDbContext>();

        var fleet = BuildFleet(suffix + "c");
        var someUser = BuildStaffUser(fleet.Id, suffix[..6]);

        db.Fleets.Add(fleet);
        db.Users.Add(someUser);
        await db.SaveChangesAsync(ct);

        var client = fixture.Factory.CreateClient();
        client.AsDispatcher(fleet.Id);

        var resp = await client.PostAsync($"api/v1/staff/{someUser.Id}/reset-password", null, ct);
        resp.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    // ── Local DTO ─────────────────────────────────────────────────────────────

    private record ResetPasswordResponse(string TemporaryPassword);

    // ── Log capture helper ─────────────────────────────────────────────────────

    /// <summary>Minimal <see cref="ILoggerProvider"/> that collects all formatted log messages so tests
    /// can assert that sensitive values (e.g. plaintext passwords) are never written to any sink.</summary>
    private sealed class LogCapture : ILoggerProvider
    {
        /// <summary>All formatted log messages captured across every category.</summary>
        public ConcurrentBag<string> Messages { get; } = new();

        /// <inheritdoc />
        public ILogger CreateLogger(string categoryName) => new Logger(Messages);

        /// <inheritdoc />
        public void Dispose() { }

        private sealed class Logger(ConcurrentBag<string> messages) : ILogger
        {
            public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
            public bool IsEnabled(LogLevel logLevel) => true;

            public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception,
                Func<TState, Exception?, string> formatter)
                => messages.Add(formatter(state, exception));
        }
    }
}

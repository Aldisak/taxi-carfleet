using Microsoft.EntityFrameworkCore;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Common.Admin;

/// <summary>Creates the initial SuperAdmin user from the CLI (`dotnet run -- create-superadmin
/// --email --password`). Testable directly against a DbContext — the Program.cs args intercept resolves
/// this from a scope, runs it, and returns before booting the web host.</summary>
internal sealed class SuperAdminBootstrapper(TaxiDbContext dbContext, TimeProvider timeProvider)
{
    /// <summary>Inserts a <see cref="UserRole.SuperAdmin"/> user (no FleetId) with the given credentials.
    /// Idempotent-ish: if a SuperAdmin with the email already exists, it is left unchanged and
    /// <paramref name="email"/> is reported as already-existing (returns false).</summary>
    /// <param name="email">The SuperAdmin login email.</param>
    /// <param name="password">The plaintext password to hash and store.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns><c>true</c> if a new SuperAdmin was created; <c>false</c> if one already existed.</returns>
    public async Task<bool> CreateAsync(string email, string password, CancellationToken ct = default)
    {
        // IgnoreQueryFilters: SuperAdmin has null FleetId and the bootstrapper runs in a null-tenant scope.
        var existing = await dbContext.Users.IgnoreQueryFilters()
            .AnyAsync(u => u.Email == email && u.Role == UserRole.SuperAdmin, ct);
        if (existing) return false;

        var now = timeProvider.GetUtcNow();
        dbContext.Users.Add(new User
        {
            Id = Guid.CreateVersion7(),
            FleetId = null,
            Role = UserRole.SuperAdmin,
            Email = email,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(password, workFactor: 11),
            Phone = $"+420000{now.ToUnixTimeSeconds() % 1000000:D6}", // placeholder; SuperAdmin logs in by email
            DisplayName = "Super Admin",
            IsActive = true,
            CreatedAt = now
        });

        await dbContext.SaveChangesAsync(ct);
        return true;
    }
}

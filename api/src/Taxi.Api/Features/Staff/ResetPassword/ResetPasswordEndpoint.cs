using System.Security.Cryptography;
using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Infrastructure;

namespace Taxi.Api.Features.Staff.ResetPassword;

/// <summary>Resets a staff user's password and returns a new temporary plaintext password exactly once.
/// Mirrors the CreateStaffEndpoint invite pattern — the plaintext is never logged.</summary>
internal sealed class ResetPasswordEndpoint(TaxiDbContext dbContext, ICurrentTenant currentTenant)
    : EndpointWithoutRequest<ResetPasswordResponse>
{
    private readonly StaffFeatureConfiguration _featureConfiguration = new();

    // Unambiguous charset: no 0/O/1/I/l to avoid confusion when reading.
    private const string TempPasswordCharset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    private const int TempPasswordLength = 16;

    /// <inheritdoc />
    public override void Configure()
    {
        Post("staff/{id:guid}/reset-password");
        Description(builder => builder
            .WithName(nameof(ResetPasswordEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.FleetAdminOnly));

        Summary(s =>
        {
            s.Summary = "Reset staff user password";
            s.Description = "Generates a new temporary password for the specified staff user. " +
                            "The plaintext temporary password is returned EXACTLY ONCE in the response and is never logged. " +
                            "Cross-tenant or absent users return 404 (no-leak).";
            s.Responses[StatusCodes.Status200OK] = "Password reset. Response includes the one-time temporary password.";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a fleet admin.";
            s.Responses[StatusCodes.Status404NotFound] = "Staff user not found or cross-tenant access.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(CancellationToken ct)
    {
        var userId = Route<Guid>("id");

        // Resolve target staff user in the current tenant — cross-tenant/absent → no-leak 404.
        // Explicitly filter by FleetId to prevent customer rows (nullable FleetId) from matching.
        var fleetId = currentTenant.FleetId;
        var user = await dbContext.Users
            .FirstOrDefaultAsync(u => u.Id == userId && u.FleetId == fleetId, ct);
        if (user is null) { await Send.NotFoundAsync(ct); return; }

        // Generate temp password — plaintext is only held in this scope; NOT logged.
        var tempPassword = GenerateTempPassword();
        var passwordHash = BCrypt.Net.BCrypt.HashPassword(tempPassword, workFactor: 11);

        user.PasswordHash = passwordHash;

        await dbContext.SaveChangesAsync(ct);

        await Send.OkAsync(new ResetPasswordResponse(tempPassword), ct);
    }

    private static string GenerateTempPassword()
        => RandomNumberGenerator.GetString(TempPasswordCharset, TempPasswordLength);
}

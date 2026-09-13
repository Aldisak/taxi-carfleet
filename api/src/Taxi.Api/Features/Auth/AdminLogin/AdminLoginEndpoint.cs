using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Common.Auth;
using Taxi.Api.Common.Features;
using Taxi.Api.Features.Auth.StaffLogin;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Features.Auth.AdminLogin;

/// <summary>Authenticates a fleetless SuperAdmin (Role=SuperAdmin, FleetId=null) and returns a JWT pair.
/// SuperAdmins are provisioned by the create-superadmin CLI and have no fleet, so they cannot use the
/// fleet-slug-scoped staff login. The minted token carries role=SuperAdmin and NO fleet_id/fleet_slug,
/// which is exactly what the SuperAdminOnly policy on /admin/fleets expects.</summary>
internal sealed class AdminLoginEndpoint(TaxiDbContext dbContext, JwtIssuer jwtIssuer, TimeProvider timeProvider)
    : Endpoint<AdminLoginRequest, StaffLoginResponse>
{
    private readonly AuthFeatureConfiguration _featureConfiguration = new();

    // Timing-uniformity constraint (mirrors StaffLoginEndpoint): every path that cannot reach a real
    // BCrypt.Verify (unknown email, not-a-superadmin, null PasswordHash) must still pay the ~100 ms
    // (work factor 11) of a verify so response time never reveals whether a SuperAdmin email exists.
    private static readonly string DummyPasswordHash = BCrypt.Net.BCrypt.HashPassword("dummy-timing-password", workFactor: 11);

    /// <inheritdoc />
    public override void Configure()
    {
        Post("auth/admin/login");
        Description(builder => builder
            .WithName(nameof(AdminLoginEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        AllowAnonymous();

        Summary(s =>
        {
            s.Summary = "SuperAdmin login";
            s.Description = "Authenticates a fleetless SuperAdmin by email and password (no fleet slug). " +
                             "AllowAnonymous — no JWT required. The returned token carries role=SuperAdmin " +
                             "and no fleet claim, so it passes the SuperAdminOnly policy on /admin/fleets.";
            s.Responses[StatusCodes.Status200OK] = "Login successful; access and refresh tokens returned.";
            s.Responses[StatusCodes.Status400BadRequest] = "Request validation failed.";
            s.Responses[StatusCodes.Status401Unauthorized] = "Invalid credentials (details not leaked).";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(AdminLoginRequest req, CancellationToken ct)
    {
        // Resolve a fleetless SuperAdmin by email. IgnoreQueryFilters because this AllowAnonymous
        // endpoint has no resolved tenant and SuperAdmin rows have a null FleetId.
        var user = await dbContext.Users.IgnoreQueryFilters().AsNoTracking()
            .FirstOrDefaultAsync(u =>
                u.Email == req.Email &&
                u.Role == UserRole.SuperAdmin &&
                u.FleetId == null &&
                u.IsActive,
                ct);

        if (user is null || user.PasswordHash is null)
        {
            // Dummy verify ensures this branch pays ~100 ms — same as a real password check.
            BCrypt.Net.BCrypt.Verify(req.Password, DummyPasswordHash);
            await Send.UnauthorizedAsync(ct);
            return;
        }

        // Verify password — uniform 401 on failure (never leak which part was wrong).
        if (!BCrypt.Net.BCrypt.Verify(req.Password, user.PasswordHash))
        {
            await Send.UnauthorizedAsync(ct);
            return;
        }

        await UpdateLastLoginAtAsync(user.Id, ct);

        // Mint a fleetless token — user.FleetId is null, so no fleet_id claim; fleetSlug null → no fleet_slug.
        var accessToken = jwtIssuer.IssueAccessToken(user, fleetSlug: null);
        var rawRefreshToken = JwtIssuer.GenerateRefreshToken();

        var refreshToken = new RefreshToken
        {
            Id = Guid.CreateVersion7(),
            UserId = user.Id,
            TokenHash = JwtIssuer.HashRefreshToken(rawRefreshToken),
            ExpiresAt = jwtIssuer.GetRefreshTokenExpiry(),
            CreatedAt = timeProvider.GetUtcNow()
        };

        dbContext.RefreshTokens.Add(refreshToken);
        await dbContext.SaveChangesAsync(ct);

        await Send.OkAsync(new StaffLoginResponse(
            AccessToken: accessToken,
            RefreshToken: rawRefreshToken,
            User: new StaffUserDto(user.Id, user.Email, user.DisplayName, user.Role.ToString())),
            ct);
    }

    private async Task UpdateLastLoginAtAsync(Guid userId, CancellationToken ct)
    {
        await dbContext.Users.IgnoreQueryFilters()
            .Where(u => u.Id == userId)
            .ExecuteUpdateAsync(u => u.SetProperty(x => x.LastLoginAt, timeProvider.GetUtcNow()), ct);
    }
}

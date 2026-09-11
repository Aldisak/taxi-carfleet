using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Auth;
using Taxi.Api.Common.Features;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Features.Auth.StaffLogin;

/// <summary>Authenticates a staff member (Driver, Dispatcher, or FleetAdmin) and returns a JWT pair.</summary>
internal sealed class StaffLoginEndpoint(TaxiDbContext dbContext, JwtIssuer jwtIssuer, TimeProvider timeProvider)
    : Endpoint<StaffLoginRequest, StaffLoginResponse>
{
    private readonly AuthFeatureConfiguration _featureConfiguration = new();

    // Timing-uniformity constraint: every code path that cannot reach BCrypt.Verify (unknown fleet,
    // unknown email, inactive user, null PasswordHash) must perform a dummy verify so that all paths
    // pay ~100 ms (work factor 11) before responding. Without this, response time reveals whether a
    // fleet slug or email exists — a remotely measurable oracle for staff-email enumeration.
    private static readonly string DummyPasswordHash = BCrypt.Net.BCrypt.HashPassword("dummy-timing-password", workFactor: 11);

    /// <inheritdoc />
    public override void Configure()
    {
        Post("auth/staff/login");
        Description(builder => builder
            .WithName(nameof(StaffLoginEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        AllowAnonymous();

        Summary(s =>
        {
            s.Summary = "Staff login";
            s.Description = "Authenticates a Driver, Dispatcher, or FleetAdmin by fleet slug, email, and password. " +
                             "AllowAnonymous — no JWT required; tenant is resolved from the request body, not ICurrentTenant.";
            s.Responses[StatusCodes.Status200OK] = "Login successful; access and refresh tokens returned.";
            s.Responses[StatusCodes.Status400BadRequest] = "Request validation failed.";
            s.Responses[StatusCodes.Status401Unauthorized] = "Invalid credentials (details not leaked).";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(StaffLoginRequest req, CancellationToken ct)
    {
        // Resolve fleet by slug — only active fleets may authenticate staff.
        // Fleets have no query filter so this always works.
        var fleet = await dbContext.Fleets.AsNoTracking()
            .FirstOrDefaultAsync(f => f.Slug == req.FleetSlug && f.IsActive, ct);

        if (fleet is null)
        {
            // Dummy verify ensures this branch pays ~100 ms — same as a real password check.
            BCrypt.Net.BCrypt.Verify(req.Password, DummyPasswordHash);
            await Send.UnauthorizedAsync(ct);
            return;
        }

        // Look up the user by email within the fleet.
        // IgnoreQueryFilters because ICurrentTenant has no FleetId yet (AllowAnonymous endpoint).
        var user = await dbContext.Users.IgnoreQueryFilters().AsNoTracking()
            .FirstOrDefaultAsync(u =>
                u.FleetId == fleet.Id &&
                u.Email == req.Email &&
                (u.Role == UserRole.Driver || u.Role == UserRole.Dispatcher || u.Role == UserRole.FleetAdmin) &&
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

        // Update LastLoginAt — need a tracked instance.
        await UpdateLastLoginAtAsync(user.Id, ct);

        // Mint tokens.
        var accessToken = jwtIssuer.IssueAccessToken(user, fleet.Slug);
        var rawRefreshToken = JwtIssuer.GenerateRefreshToken();

        var refreshToken = new RefreshToken
        {
            Id = Guid.CreateVersion7(),
            UserId = user.Id,
            TokenHash = JwtIssuer.HashRefreshToken(rawRefreshToken),
            ExpiresAt = jwtIssuer.GetRefreshTokenExpiry(),
            CreatedAt = timeProvider.GetUtcNow()
        };

        // RefreshToken has no query filter and no FleetId — save via raw scope is fine,
        // but here we can just add directly since the guard ignores non-tenant entities.
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
        // Use ExecuteUpdateAsync for a lightweight update without loading the full entity.
        await dbContext.Users.IgnoreQueryFilters()
            .Where(u => u.Id == userId)
            .ExecuteUpdateAsync(u => u.SetProperty(x => x.LastLoginAt, timeProvider.GetUtcNow()), ct);
    }
}

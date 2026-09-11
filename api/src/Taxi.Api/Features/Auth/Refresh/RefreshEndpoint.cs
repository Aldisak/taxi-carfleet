using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Common.Auth;
using Taxi.Api.Common.Features;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Features.Auth.Refresh;

/// <summary>Rotates a refresh token: revokes the presented token and issues a new access + refresh pair.</summary>
internal sealed class RefreshEndpoint(TaxiDbContext dbContext, JwtIssuer jwtIssuer, TimeProvider timeProvider)
    : Endpoint<RefreshRequest, RefreshResponse>
{
    private readonly AuthFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Post("auth/refresh");
        Description(builder => builder
            .WithName(nameof(RefreshEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        AllowAnonymous();

        Summary(s =>
        {
            s.Summary = "Refresh token rotation";
            s.Description = "Accepts a valid refresh token, revokes it, and issues a new access + refresh pair. " +
                             "AllowAnonymous — no access JWT required; the refresh token itself authorizes the call. " +
                             "Reuse of a revoked token returns 401.";
            s.Responses[StatusCodes.Status200OK] = "Token rotation successful.";
            s.Responses[StatusCodes.Status400BadRequest] = "Request validation failed.";
            s.Responses[StatusCodes.Status401Unauthorized] = "Refresh token invalid, expired, or already revoked.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(RefreshRequest req, CancellationToken ct)
    {
        var tokenHash = JwtIssuer.HashRefreshToken(req.RefreshToken);
        var now = timeProvider.GetUtcNow();

        // Atomic claim: conditionally set RevokedAt only when the token exists, is not yet revoked,
        // and has not expired. This prevents concurrent double-spend — two parallel requests with the
        // same token will race; only one will see affectedRows == 1 and proceed to mint a new pair.
        // Note: if the claim succeeds but a subsequent user/fleet check fails, the token is burned
        // (revoked, then 401). This is security-positive: a stolen token cannot be reused after any
        // attempt to refresh it, even if the owning account is concurrently deactivated.
        var affectedRows = await dbContext.RefreshTokens
            .Where(t => t.TokenHash == tokenHash && t.RevokedAt == null && t.ExpiresAt > now)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.RevokedAt, now), ct);

        if (affectedRows != 1)
        {
            await Send.UnauthorizedAsync(ct);
            return;
        }

        // Claim succeeded — read back the token row to obtain UserId.
        var stored = await dbContext.RefreshTokens.AsNoTracking()
            .FirstOrDefaultAsync(t => t.TokenHash == tokenHash, ct);

        if (stored is null)
        {
            await Send.UnauthorizedAsync(ct);
            return;
        }

        // Load the owning user — IgnoreQueryFilters because no tenant context.
        var user = await dbContext.Users.IgnoreQueryFilters().AsNoTracking()
            .FirstOrDefaultAsync(u => u.Id == stored.UserId, ct);

        if (user is null || !user.IsActive)
        {
            await Send.UnauthorizedAsync(ct);
            return;
        }

        // Load the fleet to verify it is still active and to retrieve the slug for the access token claim.
        string? fleetSlug = null;
        if (user.FleetId.HasValue)
        {
            var fleet = await dbContext.Fleets.AsNoTracking()
                .Where(f => f.Id == user.FleetId.Value)
                .Select(f => new { f.Slug, f.IsActive })
                .FirstOrDefaultAsync(ct);

            if (fleet is null || !fleet.IsActive)
            {
                await Send.UnauthorizedAsync(ct);
                return;
            }

            fleetSlug = fleet.Slug;
        }

        // Issue new token pair.
        var newAccessToken = jwtIssuer.IssueAccessToken(user, fleetSlug);
        var rawNewRefreshToken = JwtIssuer.GenerateRefreshToken();

        var newRefreshToken = new RefreshToken
        {
            Id = Guid.CreateVersion7(),
            UserId = user.Id,
            TokenHash = JwtIssuer.HashRefreshToken(rawNewRefreshToken),
            ExpiresAt = jwtIssuer.GetRefreshTokenExpiry(),
            CreatedAt = now
        };

        dbContext.RefreshTokens.Add(newRefreshToken);
        await dbContext.SaveChangesAsync(ct);

        await Send.OkAsync(new RefreshResponse(newAccessToken, rawNewRefreshToken), ct);
    }
}

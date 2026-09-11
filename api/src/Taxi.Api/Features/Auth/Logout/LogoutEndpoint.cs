using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Common.Auth;
using Taxi.Api.Common.Features;
using Taxi.Api.Infrastructure;

namespace Taxi.Api.Features.Auth.Logout;

/// <summary>Revokes the presented refresh token, effectively logging the user out of that session.</summary>
internal sealed class LogoutEndpoint(TaxiDbContext dbContext, TimeProvider timeProvider)
    : Endpoint<LogoutRequest>
{
    private readonly AuthFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Post("auth/logout");
        Description(builder => builder
            .WithName(nameof(LogoutEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        // Requires authentication — no AllowAnonymous.
        // No specific role policy: any authenticated staff or customer may log out.

        Summary(s =>
        {
            s.Summary = "Logout";
            s.Description = "Revokes the presented refresh token. Requires a valid access token.";
            s.Responses[StatusCodes.Status204NoContent] = "Logged out successfully.";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(LogoutRequest req, CancellationToken ct)
    {
        if (!string.IsNullOrEmpty(req.RefreshToken))
        {
            var tokenHash = JwtIssuer.HashRefreshToken(req.RefreshToken);
            var now = timeProvider.GetUtcNow();

            // Revoke the specific token if it belongs to the authenticated user.
            var subClaim = User.FindFirst("sub")?.Value;
            if (Guid.TryParse(subClaim, out var userId))
            {
                await dbContext.RefreshTokens
                    .Where(t =>
                        t.TokenHash == tokenHash &&
                        t.UserId == userId &&
                        t.RevokedAt == null)
                    .ExecuteUpdateAsync(t => t.SetProperty(x => x.RevokedAt, now), ct);
            }
        }

        await Send.NoContentAsync(ct);
    }
}

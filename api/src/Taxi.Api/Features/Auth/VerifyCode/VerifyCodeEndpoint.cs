using System.Security.Cryptography;
using System.Text;
using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Common;
using Taxi.Api.Common.Auth;
using Taxi.Api.Common.Features;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Features.Auth.VerifyCode;

/// <summary>Verifies a customer SMS code and returns JWT tokens on success.
/// Creates a new Customer user if this is their first login.
/// AllowAnonymous — no JWT required; this is the second step of customer authentication.</summary>
internal sealed class VerifyCodeEndpoint(TaxiDbContext dbContext, JwtIssuer jwtIssuer, TimeProvider timeProvider)
    : Endpoint<VerifyCodeRequest, VerifyCodeResponse>
{
    private const int MaxAttempts = 5;

    private readonly AuthFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Post("auth/customer/verify-code");
        Description(builder => builder
            .WithName(nameof(VerifyCodeEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        AllowAnonymous();

        Summary(s =>
        {
            s.Summary = "Verify customer SMS code";
            s.Description = "Verifies the 6-digit OTP sent by request-code. " +
                             "AllowAnonymous — unauthenticated entry point for customer login flow. " +
                             "Creates a new Customer user if this is first login. " +
                             "5 wrong attempts invalidate the code.";
            s.Responses[StatusCodes.Status200OK] = "Code verified; access and refresh tokens returned.";
            s.Responses[StatusCodes.Status400BadRequest] = "Request validation failed.";
            s.Responses[StatusCodes.Status401Unauthorized] = "Invalid, expired, or invalidated code.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(VerifyCodeRequest req, CancellationToken ct)
    {
        if (!PhoneNormalizer.TryNormalize(req.Phone, out var phone) || phone is null)
        {
            AddError(r => r.Phone, "Phone number is not a valid E.164 or normalizable Czech number.", ErrorCodes.Validation.PhoneInvalid);
            await Send.ErrorsAsync(400, ct);
            return;
        }

        var now = timeProvider.GetUtcNow();

        // Find the latest unused, unexpired code for this phone.
        // UUIDv7 is time-ordered so ordering by Id desc gives us the most recent.
        var smsCode = await dbContext.SmsCodes
            .OrderByDescending(x => x.ExpiresAt)
            .FirstOrDefaultAsync(x => x.Phone == phone && x.UsedAt == null && x.ExpiresAt > now, ct);

        // No valid code exists — uniform 401 (never reveal why).
        if (smsCode is null)
        {
            await Send.UnauthorizedAsync(ct);
            return;
        }

        // Check if already invalidated by too many attempts (must check BEFORE hash compare).
        if (smsCode.Attempts >= MaxAttempts)
        {
            await Send.UnauthorizedAsync(ct);
            return;
        }

        // Verify the code hash.
        var submittedHash = ComputeCodeHash(req.Code);
        if (submittedHash != smsCode.CodeHash)
        {
            // Atomic increment — WHERE Attempts < MaxAttempts keeps cap correct under concurrency.
            await dbContext.SmsCodes
                .Where(x => x.Id == smsCode.Id && x.Attempts < MaxAttempts)
                .ExecuteUpdateAsync(s => s.SetProperty(c => c.Attempts, c => c.Attempts + 1), ct);
            await Send.UnauthorizedAsync(ct);
            return;
        }

        // Mark code as used and find-or-create the customer user in one transaction.
        smsCode.UsedAt = now;

        // Find or create the customer user (tracked — will be saved atomically with UsedAt + refresh token).
        var user = await dbContext.Users.IgnoreQueryFilters()
            .FirstOrDefaultAsync(u => u.Phone == phone && u.Role == UserRole.Customer, ct);

        if (user is null)
        {
            user = new User
            {
                Id = Guid.CreateVersion7(),
                FleetId = null,
                Role = UserRole.Customer,
                Phone = phone,
                DisplayName = phone, // E.164 phone as display name — see handoff decisions
                IsActive = true,
                CreatedAt = now,
                LastLoginAt = now
            };
            dbContext.Users.Add(user);
        }
        else
        {
            // Update last login on the tracked entity — saved atomically below.
            user.LastLoginAt = now;
        }

        // Mint tokens — no fleet_id/fleet_slug for customers.
        var accessToken = jwtIssuer.IssueAccessToken(user, fleetSlug: null);
        var rawRefreshToken = JwtIssuer.GenerateRefreshToken();

        var refreshToken = new RefreshToken
        {
            Id = Guid.CreateVersion7(),
            UserId = user.Id,
            TokenHash = JwtIssuer.HashRefreshToken(rawRefreshToken),
            ExpiresAt = jwtIssuer.GetRefreshTokenExpiry(),
            CreatedAt = now
        };

        dbContext.RefreshTokens.Add(refreshToken);

        // Single SaveChangesAsync — marks code used, upserts user, persists refresh token atomically.
        await dbContext.SaveChangesAsync(ct);

        await Send.OkAsync(new VerifyCodeResponse(
            AccessToken: accessToken,
            RefreshToken: rawRefreshToken,
            User: new CustomerUserDto(user.Id, user.Phone, user.DisplayName, user.Role.ToString())),
            ct);
    }

    /// <summary>Computes the SHA-256 hex hash of the raw OTP code for verification.</summary>
    private static string ComputeCodeHash(string rawCode)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(rawCode));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }
}

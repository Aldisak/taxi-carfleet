using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Common.Auth;

/// <summary>Issues JWT access tokens and opaque refresh tokens for authenticated users.
/// Access tokens expire in 15 minutes; refresh tokens are 30-day opaque random strings
/// stored as SHA-256 hashes — never stored or logged as plain text.</summary>
internal sealed class JwtIssuer(IConfiguration configuration, TimeProvider timeProvider)
{
    private const int AccessTokenMinutes = 15;
    private const int RefreshTokenDays = 30;

    /// <summary>Mints a signed JWT access token for the given user.</summary>
    /// <param name="user">The authenticated user.</param>
    /// <param name="fleetSlug">The fleet slug, or null for super-admin tokens.</param>
    /// <returns>A signed JWT string.</returns>
    public string IssueAccessToken(User user, string? fleetSlug)
    {
        var key = GetSigningKey();
        var now = timeProvider.GetUtcNow();

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new("role", user.Role.ToString()),
            new(JwtRegisteredClaimNames.Name, user.DisplayName),
        };

        if (user.FleetId.HasValue)
            claims.Add(new Claim(TenantClaims.FleetId, user.FleetId.Value.ToString()));

        if (fleetSlug is not null)
            claims.Add(new Claim(TenantClaims.FleetSlug, fleetSlug));

        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(
            issuer: configuration["Jwt:Issuer"],
            audience: configuration["Jwt:Audience"],
            claims: claims,
            notBefore: now.UtcDateTime,
            expires: now.UtcDateTime.AddMinutes(AccessTokenMinutes),
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    /// <summary>Generates a cryptographically random opaque refresh token (URL-safe Base64).</summary>
    /// <returns>The raw refresh token string to return to the client.</returns>
    public static string GenerateRefreshToken()
    {
        var bytes = RandomNumberGenerator.GetBytes(64);
        return Convert.ToBase64String(bytes)
            .Replace('+', '-')
            .Replace('/', '_')
            .TrimEnd('=');
    }

    /// <summary>Computes the SHA-256 hash of a raw refresh token for storage.</summary>
    /// <param name="rawToken">The raw token received from the client.</param>
    /// <returns>A hex-encoded SHA-256 hash suitable for database storage.</returns>
    public static string HashRefreshToken(string rawToken)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(rawToken));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    /// <summary>Computes the expiry date for a new refresh token.</summary>
    /// <returns>The expiry timestamp 30 days from now.</returns>
    public DateTimeOffset GetRefreshTokenExpiry() =>
        timeProvider.GetUtcNow().AddDays(RefreshTokenDays);

    private SymmetricSecurityKey GetSigningKey()
    {
        var jwtKey = configuration["Jwt:Key"]
            ?? throw new InvalidOperationException("Jwt:Key is not configured.");
        return new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey));
    }
}

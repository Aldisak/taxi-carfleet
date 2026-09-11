using System.IdentityModel.Tokens.Jwt;
using System.Net.Http.Headers;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Tests.Infrastructure;

/// <summary>HTTP client auth helpers that mint real signed JWTs against the dev signing key.
/// The token shape matches what <c>JwtIssuer</c> produces so the app's JWT bearer middleware
/// accepts them without hitting the auth endpoints.</summary>
internal static class AuthHelpers
{
    // Dev key from appsettings.Development.json — must match the app's Jwt:Key.
    private const string DevJwtKey = "dev-jwt-signing-key-min-32-chars-00000000";
    private const string DevJwtIssuer = "taxi-api";
    private const string DevJwtAudience = "taxi-clients";
    private const string BearerScheme = "Bearer";

    /// <summary>Configures <paramref name="client"/> with a real dispatcher JWT for the given fleet.
    /// The token carries <c>role=Dispatcher</c>, <c>fleet_id</c>, and a new random <c>sub</c>.</summary>
    /// <param name="client">The HTTP client to configure.</param>
    /// <param name="fleetId">The fleet the dispatcher belongs to.</param>
    /// <param name="userId">Optional user ID to include as the <c>sub</c> claim. Defaults to a new Guid.</param>
    /// <param name="fleetSlug">Optional fleet slug claim.</param>
    /// <returns>The same <paramref name="client"/> for fluent chaining.</returns>
    internal static HttpClient AsDispatcher(
        this HttpClient client,
        Guid fleetId,
        Guid? userId = null,
        string? fleetSlug = null)
    {
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue(BearerScheme, MintToken(
                userId ?? Guid.CreateVersion7(),
                UserRole.Dispatcher,
                fleetId,
                fleetSlug));
        return client;
    }

    /// <summary>Configures <paramref name="client"/> with a real driver JWT for the given fleet + user.
    /// The token carries <c>role=Driver</c>, <c>fleet_id</c>, and the provided <c>sub</c>.</summary>
    /// <param name="client">The HTTP client to configure.</param>
    /// <param name="fleetId">The fleet the driver belongs to.</param>
    /// <param name="userId">The driver's user identifier (used as <c>sub</c>).</param>
    /// <param name="fleetSlug">Optional fleet slug claim.</param>
    /// <returns>The same <paramref name="client"/> for fluent chaining.</returns>
    internal static HttpClient AsDriver(
        this HttpClient client,
        Guid fleetId,
        Guid userId,
        string? fleetSlug = null)
    {
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue(BearerScheme, MintToken(
                userId,
                UserRole.Driver,
                fleetId,
                fleetSlug));
        return client;
    }

    /// <summary>Configures <paramref name="client"/> with a real fleet admin JWT for the given fleet.
    /// The token carries <c>role=FleetAdmin</c>, <c>fleet_id</c>, and a new random <c>sub</c>.</summary>
    /// <param name="client">The HTTP client to configure.</param>
    /// <param name="fleetId">The fleet the fleet admin belongs to.</param>
    /// <param name="userId">Optional user ID to include as the <c>sub</c> claim. Defaults to a new Guid.</param>
    /// <param name="fleetSlug">Optional fleet slug claim.</param>
    /// <returns>The same <paramref name="client"/> for fluent chaining.</returns>
    internal static HttpClient AsFleetAdmin(
        this HttpClient client,
        Guid fleetId,
        Guid? userId = null,
        string? fleetSlug = null)
    {
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue(BearerScheme, MintToken(
                userId ?? Guid.CreateVersion7(),
                UserRole.FleetAdmin,
                fleetId,
                fleetSlug));
        return client;
    }

    /// <summary>Configures <paramref name="client"/> with a real customer JWT.
    /// The token carries <c>role=Customer</c> and a new random <c>sub</c>; no <c>fleet_id</c>.</summary>
    /// <param name="client">The HTTP client to configure.</param>
    /// <param name="userId">The customer's user identifier. Defaults to a new Guid.</param>
    /// <returns>The same <paramref name="client"/> for fluent chaining.</returns>
    internal static HttpClient AsCustomer(
        this HttpClient client,
        Guid? userId = null)
    {
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue(BearerScheme, MintToken(
                userId ?? Guid.CreateVersion7(),
                UserRole.Customer,
                fleetId: null,
                fleetSlug: null));
        return client;
    }

    /// <summary>Mints a signed JWT for the given user identity and role.
    /// Useful when the caller needs the raw token string (e.g. for SignalR connections).</summary>
    /// <param name="userId">The user identifier (maps to <c>sub</c> claim).</param>
    /// <param name="role">The user role.</param>
    /// <param name="fleetId">Optional fleet identifier. Null for customers.</param>
    /// <param name="fleetSlug">Optional fleet slug.</param>
    /// <returns>Signed JWT as a string.</returns>
    internal static string MintTokenFor(
        Guid userId,
        UserRole role,
        Guid? fleetId,
        string? fleetSlug = null) =>
        MintToken(userId, role, fleetId, fleetSlug);

    private static string MintToken(
        Guid userId,
        UserRole role,
        Guid? fleetId,
        string? fleetSlug)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(DevJwtKey));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, userId.ToString()),
            new("role", role.ToString()),
            new(JwtRegisteredClaimNames.Name, $"Test {role}"),
        };

        if (fleetId.HasValue)
            claims.Add(new Claim(TenantClaims.FleetId, fleetId.Value.ToString()));

        if (fleetSlug is not null)
            claims.Add(new Claim(TenantClaims.FleetSlug, fleetSlug));

        var now = DateTime.UtcNow;
        var token = new JwtSecurityToken(
            issuer: DevJwtIssuer,
            audience: DevJwtAudience,
            claims: claims,
            notBefore: now,
            expires: now.AddHours(1),
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}

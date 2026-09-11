namespace Taxi.Api.Common.Tenancy;

/// <summary>Canonical JWT claim name constants for tenant resolution.
/// Used by <see cref="TenantResolutionMiddleware"/> and the auth token issuer (WI-05)
/// to ensure both sides agree on claim names.</summary>
internal static class TenantClaims
{
    /// <summary>JWT claim carrying the fleet identifier (Guid string). Value: <c>"fleet_id"</c>.</summary>
    public const string FleetId = "fleet_id";

    /// <summary>JWT claim carrying the fleet slug. Value: <c>"fleet_slug"</c>.</summary>
    public const string FleetSlug = "fleet_slug";
}

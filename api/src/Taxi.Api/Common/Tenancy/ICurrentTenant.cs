namespace Taxi.Api.Common.Tenancy;

/// <summary>Provides the resolved fleet identity for the current HTTP request.
/// Resolved by <see cref="TenantResolutionMiddleware"/> from the JWT claim, X-Fleet-Slug header,
/// or subdomain, in that order.</summary>
internal interface ICurrentTenant
{
    /// <summary>Gets the fleet identifier for the current request. Null when no tenant has been resolved
    /// (e.g. health checks, SuperAdmin cross-tenant requests, or requests with an unknown slug).</summary>
    Guid? FleetId { get; }

    /// <summary>Gets the fleet slug for the current request. Null when not resolved.</summary>
    string? Slug { get; }
}

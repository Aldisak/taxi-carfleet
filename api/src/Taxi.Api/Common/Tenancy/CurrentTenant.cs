namespace Taxi.Api.Common.Tenancy;

/// <summary>Scoped implementation of <see cref="ICurrentTenant"/>. Written to by
/// <see cref="TenantResolutionMiddleware"/> and read by anything that needs the current fleet.</summary>
internal sealed class CurrentTenant : ICurrentTenant
{
    /// <inheritdoc />
    public Guid? FleetId { get; set; }

    /// <inheritdoc />
    public string? Slug { get; set; }
}

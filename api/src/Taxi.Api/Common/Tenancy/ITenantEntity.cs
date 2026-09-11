namespace Taxi.Api.Common.Tenancy;

/// <summary>Marker interface for entities that are scoped to a fleet.
/// EF Core global query filters are applied to all implementors.
/// <c>TaxiDbContext</c> automatically stamps <c>FleetId</c> on added entities.</summary>
internal interface ITenantEntity
{
    /// <summary>Fleet this entity belongs to.</summary>
    Guid FleetId { get; set; }
}

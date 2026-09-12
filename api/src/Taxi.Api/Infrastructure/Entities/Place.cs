using Taxi.Api.Common.Tenancy;

namespace Taxi.Api.Infrastructure.Entities;

/// <summary>A named point of interest (station, hospital, square) used for dispatcher quick-fill chips
/// and customer address suggestions.</summary>
public class Place : ITenantEntity
{
    /// <summary>Primary key (UUIDv7, app-generated).</summary>
    public Guid Id { get; set; }

    /// <summary>Fleet this place belongs to.</summary>
    public Guid FleetId { get; set; }

    /// <summary>Display name of the place.</summary>
    public required string Name { get; set; }

    /// <summary>Latitude of the place.</summary>
    public double Lat { get; set; }

    /// <summary>Longitude of the place.</summary>
    public double Lng { get; set; }

    /// <summary>Human-readable address of the place.</summary>
    public required string Address { get; set; }

    /// <summary>Sort order for display (ascending). Lower values appear first.</summary>
    public int SortOrder { get; set; }

    /// <summary>Whether this place is currently enabled.</summary>
    public bool IsEnabled { get; set; }
}

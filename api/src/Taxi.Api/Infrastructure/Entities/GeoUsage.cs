namespace Taxi.Api.Infrastructure.Entities;

/// <summary>Per-fleet, per-day, per-kind aggregate of geo-provider API usage and credit consumption.
/// NOT an ITenantEntity — no global query filter. Explicit FleetId scoping is required at every call site.</summary>
public class GeoUsage
{
    /// <summary>Fleet this usage row belongs to (part of composite PK).</summary>
    public Guid FleetId { get; set; }

    /// <summary>Calendar day (Prague local date) for this aggregate (part of composite PK).</summary>
    public DateOnly Day { get; set; }

    /// <summary>Kind of geo-provider API call (part of composite PK, stored as string).</summary>
    public GeoCacheKind Kind { get; set; }

    /// <summary>Number of API calls made on this day for this kind.</summary>
    public int Calls { get; set; }

    /// <summary>Estimated credit consumption for this day and kind.</summary>
    public int CreditsEst { get; set; }
}

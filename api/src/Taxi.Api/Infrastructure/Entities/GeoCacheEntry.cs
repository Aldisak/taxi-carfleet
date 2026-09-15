using System.Text.Json;

namespace Taxi.Api.Infrastructure.Entities;

/// <summary>Cached response from a geo-provider API call. NOT an ITenantEntity — no global query filter.
/// Explicit FleetId scoping is required at every call site.</summary>
public class GeoCacheEntry
{
    /// <summary>Fleet this cache entry belongs to (part of composite PK).</summary>
    public Guid FleetId { get; set; }

    /// <summary>Kind of geo-provider API call (part of composite PK, stored as string).</summary>
    public GeoCacheKind Kind { get; set; }

    /// <summary>Cache key — typically a normalised query string or coordinate hash (part of composite PK).</summary>
    public required string Key { get; set; }

    /// <summary>Serialised provider response in JSON. Null when the entry records a negative cache hit.</summary>
    public JsonDocument? Value { get; set; }

    /// <summary>UTC timestamp when this cache entry was written. Indexed for TTL sweep jobs.</summary>
    public DateTimeOffset CreatedAt { get; set; }
}

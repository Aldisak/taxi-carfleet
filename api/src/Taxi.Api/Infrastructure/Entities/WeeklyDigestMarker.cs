using Taxi.Api.Common.Tenancy;

namespace Taxi.Api.Infrastructure.Entities;

/// <summary>Idempotency marker recording that the weekly digest email was sent for a given
/// ISO week. Prevents duplicate sends when the background job retries.</summary>
public class WeeklyDigestMarker : ITenantEntity
{
    /// <summary>Primary key (UUIDv7, app-generated).</summary>
    public Guid Id { get; set; }

    /// <summary>Fleet this marker belongs to.</summary>
    public Guid FleetId { get; set; }

    /// <summary>ISO 8601 calendar year (e.g. 2026).</summary>
    public int IsoYear { get; set; }

    /// <summary>ISO 8601 week number (1–53).</summary>
    public int IsoWeek { get; set; }

    /// <summary>UTC timestamp when the digest was sent.</summary>
    public DateTimeOffset SentAt { get; set; }
}

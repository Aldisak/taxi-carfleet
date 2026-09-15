using Taxi.Api.Common.Tenancy;

namespace Taxi.Api.Infrastructure.Entities;

/// <summary>Idempotency marker recording that a geo budget alert was sent for a given fleet, calendar month,
/// and threshold (80 or 100 percent). Prevents duplicate alerts within the same month.</summary>
public class GeoBudgetAlertMarker : ITenantEntity
{
    /// <summary>Primary key (UUIDv7).</summary>
    public Guid Id { get; set; }

    /// <summary>The fleet this marker belongs to.</summary>
    public Guid FleetId { get; set; }

    /// <summary>Prague-local calendar year of the alert month.</summary>
    public int Year { get; set; }

    /// <summary>Prague-local calendar month of the alert (1–12).</summary>
    public int Month { get; set; }

    /// <summary>Alert threshold that was crossed: 80 or 100 (percent).</summary>
    public int Threshold { get; set; }

    /// <summary>UTC timestamp when the alert was sent.</summary>
    public DateTimeOffset SentAt { get; set; }
}

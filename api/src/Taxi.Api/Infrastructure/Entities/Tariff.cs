using Taxi.Api.Common.Tenancy;

namespace Taxi.Api.Infrastructure.Entities;

/// <summary>A metered or estimated pricing tariff for a fleet.</summary>
public class Tariff : ITenantEntity
{
    /// <summary>Primary key (UUIDv7, app-generated).</summary>
    public Guid Id { get; set; }

    /// <summary>Fleet this tariff belongs to.</summary>
    public Guid FleetId { get; set; }

    /// <summary>Display name of the tariff.</summary>
    public required string Name { get; set; }

    /// <summary>Base fare in CZK (integer) charged at the start of the ride.</summary>
    public int BaseFareCzk { get; set; }

    /// <summary>Per-kilometre rate in CZK (integer).</summary>
    public int PerKmCzk { get; set; }

    /// <summary>Per-minute waiting rate in CZK (integer).</summary>
    public int PerMinuteWaitingCzk { get; set; }

    /// <summary>Minimum fare in CZK (integer) regardless of distance.</summary>
    public int MinimumFareCzk { get; set; }

    /// <summary>Whether this is the default tariff for the fleet.</summary>
    public bool IsDefault { get; set; }

    /// <summary>Whether this tariff is currently enabled.</summary>
    public bool IsEnabled { get; set; }
}

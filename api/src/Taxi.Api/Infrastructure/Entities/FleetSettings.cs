using Taxi.Api.Common.Tenancy;

namespace Taxi.Api.Infrastructure.Entities;

/// <summary>Per-fleet operational settings. Uses <see cref="FleetId"/> as the primary key (1:1 with Fleet).</summary>
public class FleetSettings : ITenantEntity
{
    /// <summary>Primary key — the fleet this settings record belongs to.</summary>
    public Guid FleetId { get; set; }

    /// <summary>Seconds before an unaccepted Assigned order times out. Defaults to 45.</summary>
    public int OfferTimeoutSeconds { get; set; } = 45;

    /// <summary>Whether the system should auto-dispatch new orders. Defaults to false.</summary>
    public bool AutoDispatchEnabled { get; set; }

    /// <summary>Seconds after order creation before auto-dispatch triggers. Defaults to 60.</summary>
    public int AutoDispatchAfterSeconds { get; set; } = 60;

    /// <summary>Maximum radius in km for auto-dispatch driver search. Defaults to 15.</summary>
    public int MaxOfferRadiusKm { get; set; } = 15;

    /// <summary>Sender name shown on outgoing SMS messages.</summary>
    public string? SmsSenderName { get; set; }

    /// <summary>Welcome text sent to new customers.</summary>
    public string? WelcomeText { get; set; }
}

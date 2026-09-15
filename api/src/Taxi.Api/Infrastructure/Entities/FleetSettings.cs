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

    /// <summary>Monthly SMS cost cap in CZK. When reached, SMS is skipped except DriverArrived.
    /// Defaults to 500.</summary>
    public int SmsMonthlyCapCzk { get; set; } = 500;

    /// <summary>Cost of a single SMS in CZK, used to count spend against the cap. Defaults to 1.</summary>
    public int SmsUnitCostCzk { get; set; } = 1;

    /// <summary>Mapy.com server-side API key (base64, protected). Null until configured by the fleet admin.
    /// MUST NOT be logged or exposed to the browser.</summary>
    public string? MapyServerKey { get; set; }

    /// <summary>Mapy.com browser-side API key. Null until configured by the fleet admin.</summary>
    public string? MapyBrowserKey { get; set; }

    /// <summary>Default map center latitude for the dispatcher board. Defaults to 50.08 (Prague).</summary>
    public double MapCenterLat { get; set; } = 50.08;

    /// <summary>Default map center longitude for the dispatcher board. Defaults to 14.42 (Prague).</summary>
    public double MapCenterLng { get; set; } = 14.42;

    /// <summary>Default map zoom level for the dispatcher board. Defaults to 12.</summary>
    public int MapZoom { get; set; } = 12;

    /// <summary>Monthly credit budget for Mapy.com API calls. When exceeded, geo requests are throttled.
    /// Defaults to 250 000 credits.</summary>
    public int GeoMonthlyCreditBudget { get; set; } = 250_000;
}

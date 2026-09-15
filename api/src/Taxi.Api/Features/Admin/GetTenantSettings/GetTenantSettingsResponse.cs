namespace Taxi.Api.Features.Admin.GetTenantSettings;

/// <summary>Response DTO for GET admin/fleets/{id}/settings.
/// Carries all editable Fleet + FleetSettings fields.
/// The Mapy server key is structurally absent — only the configured flag is returned.</summary>
public sealed record GetTenantSettingsResponse
{
    // ── Fleet fields ──────────────────────────────────────────────────────────

    /// <summary>The fleet's display name.</summary>
    public required string Name { get; init; }

    /// <summary>The fleet's contact phone number (E.164).</summary>
    public required string Phone { get; init; }

    /// <summary>ISO 4217 currency code (e.g. CZK).</summary>
    public required string Currency { get; init; }

    /// <summary>IANA time zone identifier (e.g. Europe/Prague).</summary>
    public required string TimeZone { get; init; }

    /// <summary>Optional brand primary color as a #RRGGBB hex string.</summary>
    public string? PrimaryColorHex { get; init; }

    /// <summary>Whether the fleet is currently active.</summary>
    public required bool IsActive { get; init; }

    // ── FleetSettings — dispatch ──────────────────────────────────────────────

    /// <summary>Seconds before an unaccepted Assigned order times out. Default 45.</summary>
    public required int OfferTimeoutSeconds { get; init; }

    /// <summary>Whether the system should auto-dispatch new orders.</summary>
    public required bool AutoDispatchEnabled { get; init; }

    /// <summary>Seconds after order creation before auto-dispatch triggers. Default 60.</summary>
    public required int AutoDispatchAfterSeconds { get; init; }

    /// <summary>Maximum radius in km for auto-dispatch driver search. Default 15.</summary>
    public required int MaxOfferRadiusKm { get; init; }

    // ── FleetSettings — SMS ───────────────────────────────────────────────────

    /// <summary>Sender name shown on outgoing SMS messages.</summary>
    public string? SmsSenderName { get; init; }

    /// <summary>Welcome text sent to new customers.</summary>
    public string? WelcomeText { get; init; }

    /// <summary>Monthly SMS cost cap in CZK. Default 500.</summary>
    public required int SmsMonthlyCapCzk { get; init; }

    /// <summary>Cost of a single SMS in CZK. Default 1.</summary>
    public required int SmsUnitCostCzk { get; init; }

    // ── FleetSettings — map ───────────────────────────────────────────────────

    /// <summary>Default map center latitude. Default 50.08 (Prague).</summary>
    public required double MapCenterLat { get; init; }

    /// <summary>Default map center longitude. Default 14.42 (Prague).</summary>
    public required double MapCenterLng { get; init; }

    /// <summary>Default map zoom level. Default 12.</summary>
    public required int MapZoom { get; init; }

    // ── FleetSettings — geo ───────────────────────────────────────────────────

    /// <summary>Monthly credit budget for Mapy.com API calls. Default 250 000.</summary>
    public required int GeoMonthlyCreditBudget { get; init; }

    // ── Mapy keys ─────────────────────────────────────────────────────────────

    /// <summary>The Mapy.com browser API key (decrypted for the UI), or null if not configured.</summary>
    public string? MapyBrowserKey { get; init; }

    /// <summary>Whether a Mapy server key is currently configured. The value is never returned.</summary>
    public required bool MapyServerKeyConfigured { get; init; }
}

namespace Taxi.Api.Features.Admin.UpdateTenantSettings;

/// <summary>Request DTO for PUT admin/fleets/{id}/settings.
/// All properties use plain init setters (no C# required) to avoid STJ 500-trap.
/// The validator enforces all required fields as 400. Mapy key semantics:
/// null = keep existing column value; empty string = clear to null; non-empty = encrypt and store.</summary>
public sealed record UpdateTenantSettingsRequest
{
    /// <summary>Route-bound fleet id (populated by FastEndpoints from the route segment).</summary>
    public Guid Id { get; init; }

    // ── Fleet fields ──────────────────────────────────────────────────────────

    /// <summary>The fleet's display name.</summary>
    public string Name { get; init; } = string.Empty;

    /// <summary>The fleet's contact phone number (E.164).</summary>
    public string Phone { get; init; } = string.Empty;

    /// <summary>ISO 4217 currency code (e.g. CZK).</summary>
    public string Currency { get; init; } = "CZK";

    /// <summary>IANA time zone identifier (e.g. Europe/Prague).</summary>
    public string TimeZone { get; init; } = "Europe/Prague";

    /// <summary>Optional brand primary color as a #RRGGBB hex string. Null to clear.</summary>
    public string? PrimaryColorHex { get; init; }

    /// <summary>Whether the fleet should be active.</summary>
    public bool IsActive { get; init; }

    // ── FleetSettings — dispatch ──────────────────────────────────────────────

    /// <summary>Seconds before an unaccepted Assigned order times out. Default 45.</summary>
    public int OfferTimeoutSeconds { get; init; } = 45;

    /// <summary>Whether auto-dispatch is enabled.</summary>
    public bool AutoDispatchEnabled { get; init; }

    /// <summary>Seconds after order creation before auto-dispatch triggers. Default 60.</summary>
    public int AutoDispatchAfterSeconds { get; init; } = 60;

    /// <summary>Maximum radius in km for auto-dispatch driver search. Default 15.</summary>
    public int MaxOfferRadiusKm { get; init; } = 15;

    // ── FleetSettings — SMS ───────────────────────────────────────────────────

    /// <summary>Sender name shown on outgoing SMS messages.</summary>
    public string? SmsSenderName { get; init; }

    /// <summary>Welcome text sent to new customers.</summary>
    public string? WelcomeText { get; init; }

    /// <summary>Monthly SMS cost cap in CZK. Default 500.</summary>
    public int SmsMonthlyCapCzk { get; init; } = 500;

    /// <summary>Cost of a single SMS in CZK. Default 1.</summary>
    public int SmsUnitCostCzk { get; init; } = 1;

    // ── FleetSettings — map ───────────────────────────────────────────────────

    /// <summary>Default map center latitude (WGS84, -90..90). Body-bound as double (STJ invariant parsing).</summary>
    public double MapCenterLat { get; init; } = 50.08;

    /// <summary>Default map center longitude (WGS84, -180..180). Body-bound as double.</summary>
    public double MapCenterLng { get; init; } = 14.42;

    /// <summary>Default map zoom level (1..20). Default 12.</summary>
    public int MapZoom { get; init; } = 12;

    // ── FleetSettings — geo ───────────────────────────────────────────────────

    /// <summary>Monthly credit budget for Mapy.com API calls. Default 250 000.</summary>
    public int GeoMonthlyCreditBudget { get; init; } = 250_000;

    // ── Mapy keys (null=keep, ""=clear, non-empty=protect+store) ─────────────

    /// <summary>Mapy server API key plaintext. null=keep column; ""=clear column; non-empty=encrypt and store.
    /// MUST NOT be logged. This field is write-only — GET never returns the server key value.</summary>
    public string? MapyServerKey { get; init; }

    /// <summary>Mapy browser API key plaintext. null=keep column; ""=clear column; non-empty=encrypt and store.</summary>
    public string? MapyBrowserKey { get; init; }
}

namespace Taxi.Api.Features.Fleet.UpdateFleetSettings;

/// <summary>Request body for PUT /fleet/settings — the fleet self-service editable set.</summary>
public sealed class UpdateFleetSettingsRequest
{
    /// <summary>Fleet display name.</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>Fleet contact phone (E.164).</summary>
    public string Phone { get; set; } = string.Empty;

    /// <summary>Optional brand primary color as #RRGGBB; null clears it.</summary>
    public string? PrimaryColorHex { get; set; }

    /// <summary>Optional welcome text shown in the customer PWA; null clears it.</summary>
    public string? WelcomeText { get; set; }

    /// <summary>Seconds before an unaccepted offer times out (10..600).</summary>
    public int OfferTimeoutSeconds { get; set; }

    /// <summary>Monthly SMS cost cap in CZK (>= 0).</summary>
    public int SmsMonthlyCapCzk { get; set; }

    /// <summary>Whether auto-dispatch is enabled (persisted; UI-disabled in v1.1).</summary>
    public bool AutoDispatchEnabled { get; set; }
}

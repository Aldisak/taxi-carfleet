namespace Taxi.Api.Features.Fleet.GetFleetSettings;

/// <summary>Combined read-only DTO from Fleet and FleetSettings for the Settings Fleet tab.
/// Round-trips the full editable set accepted by PUT /fleet/settings so the client never has to
/// reconstruct fields (primary color, welcome text, SMS cap) from other endpoints.</summary>
public record GetFleetSettingsResponse(
    string Name,
    string Phone,
    int OfferTimeoutSeconds,
    bool AutoDispatchEnabled,
    string? PrimaryColorHex,
    string? WelcomeText,
    int SmsMonthlyCapCzk);

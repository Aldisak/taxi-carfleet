namespace Taxi.Api.Features.Fleet.GetFleetSettings;

/// <summary>Combined read-only DTO from Fleet and FleetSettings for the Settings Fleet tab.</summary>
public record GetFleetSettingsResponse(
    string Name,
    string Phone,
    int OfferTimeoutSeconds,
    bool AutoDispatchEnabled);

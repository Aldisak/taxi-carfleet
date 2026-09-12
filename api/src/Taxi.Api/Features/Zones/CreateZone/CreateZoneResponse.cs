namespace Taxi.Api.Features.Zones.CreateZone;

/// <summary>Response for POST /zones — the created zone's id.</summary>
/// <param name="Id">The created zone's id.</param>
public record CreateZoneResponse(Guid Id);

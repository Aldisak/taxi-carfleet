namespace Taxi.Api.Features.Zones.ListZones;

/// <summary>Response for GET /zones — the fleet's zones.</summary>
/// <param name="Zones">The zones.</param>
public record ListZonesResponse(IReadOnlyList<ZoneDto> Zones);

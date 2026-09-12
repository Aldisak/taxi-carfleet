namespace Taxi.Api.Features.Places.ListPlaces;

/// <summary>Response for GET /places — the fleet's places ordered by sort order.</summary>
/// <param name="Places">The places, ordered ascending by SortOrder.</param>
public record ListPlacesResponse(IReadOnlyList<PlaceDto> Places);

namespace Taxi.Api.Features.Places.CreatePlace;

/// <summary>Response for POST /places — the created place.</summary>
/// <param name="Id">The created place's id.</param>
/// <param name="Name">Display name.</param>
/// <param name="Lat">Latitude.</param>
/// <param name="Lng">Longitude.</param>
/// <param name="Address">Human-readable address.</param>
/// <param name="SortOrder">Display sort order.</param>
/// <param name="IsEnabled">Whether the place is enabled.</param>
public record CreatePlaceResponse(
    Guid Id,
    string Name,
    double Lat,
    double Lng,
    string Address,
    int SortOrder,
    bool IsEnabled);

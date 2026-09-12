namespace Taxi.Api.Features.Places.ListPlaces;

/// <summary>A named place projected for listing.</summary>
/// <param name="Id">Place primary key.</param>
/// <param name="Name">Display name.</param>
/// <param name="Lat">Latitude.</param>
/// <param name="Lng">Longitude.</param>
/// <param name="Address">Human-readable address.</param>
/// <param name="SortOrder">Display sort order (ascending).</param>
/// <param name="IsEnabled">Whether the place is enabled.</param>
public record PlaceDto(
    Guid Id,
    string Name,
    double Lat,
    double Lng,
    string Address,
    int SortOrder,
    bool IsEnabled);

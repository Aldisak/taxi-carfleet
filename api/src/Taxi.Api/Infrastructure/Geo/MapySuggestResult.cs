namespace Taxi.Api.Infrastructure.Geo;

/// <summary>Enriched address suggestion result from Mapy.com, carrying parsed regionalStructure fields.</summary>
/// <param name="Label">Full human-readable label from the upstream.</param>
/// <param name="Street">Street name from regionalStructure, or <see langword="null"/> if not present.</param>
/// <param name="Municipality">Municipality name from regionalStructure, or <see langword="null"/> if not present.</param>
/// <param name="Lat">Latitude of the suggested point.</param>
/// <param name="Lng">Longitude of the suggested point.</param>
public record MapySuggestResult(string Label, string? Street, string? Municipality, double Lat, double Lng);

/// <summary>Route result parsed from the Mapy.com routing API.</summary>
/// <param name="DistanceMeters">Total route length in metres.</param>
/// <param name="DurationSeconds">Estimated travel time in seconds.</param>
/// <param name="Geometry">Simplified route geometry, max 200 points.</param>
public record MapyRouteResultData(
    int DistanceMeters,
    int DurationSeconds,
    IReadOnlyList<MapyGeoPoint> Geometry);

/// <summary>A geographic coordinate point.</summary>
/// <param name="Lat">Latitude.</param>
/// <param name="Lng">Longitude.</param>
public record MapyGeoPoint(double Lat, double Lng);

/// <summary>Geocode result (forward lookup) from Mapy.com.</summary>
/// <param name="Found">Whether the query was resolved to a location.</param>
/// <param name="Label">Full human-readable label, or <see langword="null"/> when <paramref name="Found"/> is false.</param>
/// <param name="Lat">Latitude, or <see langword="null"/> when <paramref name="Found"/> is false.</param>
/// <param name="Lng">Longitude, or <see langword="null"/> when <paramref name="Found"/> is false.</param>
public record MapyGeocodeResult(bool Found, string? Label, double? Lat, double? Lng);

/// <summary>Reverse-geocode result from Mapy.com.</summary>
/// <param name="Found">Whether the coordinates resolved to an address.</param>
/// <param name="Label">Full human-readable label, or <see langword="null"/> when not found.</param>
/// <param name="Street">Street name, or <see langword="null"/>.</param>
/// <param name="Municipality">Municipality name, or <see langword="null"/>.</param>
public record MapyRgeocodeResult(bool Found, string? Label, string? Street, string? Municipality);

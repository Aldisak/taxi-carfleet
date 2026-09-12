namespace Taxi.Api.Infrastructure.Geo;

/// <summary>A single address suggestion result from the geocoding upstream.</summary>
public record GeoSuggestItem(string Label, double Lat, double Lng);

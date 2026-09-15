namespace Taxi.Api.Features.Geo.Suggest;

/// <summary>A single address suggestion result enriched with parsed address components.</summary>
public record SuggestItemDto(string Label, string? Street, string? Municipality, double Lat, double Lng);

namespace Taxi.Api.Features.Geo.Suggest;

/// <summary>A single address suggestion result.</summary>
public record SuggestItemDto(string Label, double Lat, double Lng);

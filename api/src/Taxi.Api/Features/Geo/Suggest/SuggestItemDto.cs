namespace Taxi.Api.Features.Geo.Suggest;

/// <summary>A single address suggestion result enriched with parsed address components.</summary>
/// <param name="Name">The full address text incl. house number (e.g. "Kouřimská 2368/4") — the primary display value.</param>
/// <param name="Label">Mapy's TYPE category ("Adresa"/"Ulice"/…) — a discriminator, not for display.</param>
/// <param name="Street">Street name (secondary context), or null.</param>
/// <param name="Municipality">Municipality name (secondary context), or null.</param>
/// <param name="Lat">Latitude.</param>
/// <param name="Lng">Longitude.</param>
public record SuggestItemDto(string Name, string Label, string? Street, string? Municipality, double Lat, double Lng);

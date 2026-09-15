namespace Taxi.Api.Features.Geo.Geocode;

/// <summary>Request for GET /geo/geocode — forward geocoding (text → coordinates).</summary>
public sealed class GeocodeRequest
{
    /// <summary>Address or place text to geocode.</summary>
    public string Q { get; set; } = string.Empty;
}

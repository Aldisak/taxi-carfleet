namespace Taxi.Api.Features.Geo.Reverse;

/// <summary>Request for GET /geo/reverse — reverse geocoding (coordinates → address).</summary>
public sealed class ReverseRequest
{
    /// <summary>Latitude as a string — parsed with InvariantCulture to avoid Czech locale decimal-separator issues.</summary>
    public string? Lat { get; set; }

    /// <summary>Longitude as a string — parsed with InvariantCulture to avoid Czech locale decimal-separator issues.</summary>
    public string? Lng { get; set; }
}

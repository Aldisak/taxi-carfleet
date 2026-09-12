namespace Taxi.Api.Features.Geo.Route;

/// <summary>Request for GET /geo/route — distance and duration between two coordinates.
/// Coordinates are received as strings to avoid locale-specific double parsing issues.</summary>
public sealed class RouteRequest
{
    /// <summary>Origin latitude (string, parsed as invariant double).</summary>
    public string? FromLat { get; set; }

    /// <summary>Origin longitude (string, parsed as invariant double).</summary>
    public string? FromLng { get; set; }

    /// <summary>Destination latitude (string, parsed as invariant double).</summary>
    public string? ToLat { get; set; }

    /// <summary>Destination longitude (string, parsed as invariant double).</summary>
    public string? ToLng { get; set; }
}

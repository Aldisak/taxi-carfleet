namespace Taxi.Api.Features.Geo.Route;

/// <summary>Request body for POST /geo/route — point-to-point route distance and duration.
/// Coordinates are received as nested objects with <see cref="double"/> fields. STJ body parsing
/// uses invariant culture, so no string-based workaround is needed (unlike GET query params).</summary>
public sealed class RouteRequest
{
    /// <summary>Origin coordinate. Required; null when the property is absent from the JSON body.</summary>
    public GeoPoint? From { get; set; }

    /// <summary>Destination coordinate. Required; null when the property is absent from the JSON body.</summary>
    public GeoPoint? To { get; set; }
}

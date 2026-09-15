namespace Taxi.Api.Features.Geo.Route;

/// <summary>A geographic coordinate point used in the POST /geo/route request body.
/// Properties are plain <see cref="double"/> (STJ body parsing is invariant-culture;
/// the string-parse workaround is only needed for GET query parameters).
/// NO <see langword="required"/> keyword — missing values default to 0.0 and are caught by the validator.</summary>
public sealed class GeoPoint
{
    /// <summary>Latitude in decimal degrees (WGS84). Valid range: -90 to 90.</summary>
    public double Lat { get; set; }

    /// <summary>Longitude in decimal degrees (WGS84). Valid range: -180 to 180.</summary>
    public double Lng { get; set; }
}

namespace Taxi.Api.Features.Geo.Suggest;

/// <summary>Request for GET /geo/suggest — address autocomplete.</summary>
public sealed class SuggestRequest
{
    /// <summary>Search query text.</summary>
    public string Q { get; set; } = string.Empty;

    /// <summary>Optional near-coordinate hint for location-biased results.
    /// Format: <c>"lat,lng"</c> (dot-decimal, InvariantCulture). Malformed values are silently ignored.</summary>
    public string? Near { get; set; }
}

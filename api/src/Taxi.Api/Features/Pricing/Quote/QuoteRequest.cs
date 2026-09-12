namespace Taxi.Api.Features.Pricing.Quote;

/// <summary>Request for GET /pricing/quote. Coordinates are received as strings to avoid
/// locale-specific double parsing issues (FastEndpoints query binding; CLAUDE.md).</summary>
public sealed class QuoteRequest
{
    /// <summary>Pickup latitude (string, parsed as invariant double).</summary>
    public string? FromLat { get; set; }

    /// <summary>Pickup longitude (string, parsed as invariant double).</summary>
    public string? FromLng { get; set; }

    /// <summary>Dropoff latitude (string, parsed as invariant double). Optional — omit for a wide estimate.</summary>
    public string? ToLat { get; set; }

    /// <summary>Dropoff longitude (string, parsed as invariant double). Optional — omit for a wide estimate.</summary>
    public string? ToLng { get; set; }
}

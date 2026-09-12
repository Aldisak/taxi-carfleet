namespace Taxi.Api.Features.Pricing.Quote;

/// <summary>Request body for POST /pricing/quote. Coordinates are numeric JSON (a POST body sidesteps
/// the cs-CZ double query-binding trap — CLAUDE.md). Dropoff is optional: a Zone route matches on
/// pickup-in-zone alone. Properties are plain (not <c>required</c>) so a missing field defaults
/// rather than throwing during STJ deserialization; the validator bounds them.</summary>
public sealed class QuoteRequest
{
    /// <summary>Pickup latitude.</summary>
    public double PickupLat { get; init; }

    /// <summary>Pickup longitude.</summary>
    public double PickupLng { get; init; }

    /// <summary>Dropoff latitude. Null/absent for a pickup-only quote.</summary>
    public double? DropoffLat { get; init; }

    /// <summary>Dropoff longitude. Null/absent for a pickup-only quote.</summary>
    public double? DropoffLng { get; init; }

    /// <summary>Evaluation time for route validity windows. Null means "now".</summary>
    public DateTimeOffset? At { get; init; }
}

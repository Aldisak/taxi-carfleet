namespace Taxi.Api.Infrastructure.Entities;

/// <summary>Discriminator for geo-provider API call kinds tracked in the cache and usage tables.</summary>
public enum GeoCacheKind
{
    /// <summary>Address autocomplete suggestion call.</summary>
    Suggest,

    /// <summary>Forward geocoding call (address → coordinates).</summary>
    Geocode,

    /// <summary>Reverse geocoding call (coordinates → address).</summary>
    Reverse,

    /// <summary>Route/navigation call (origin → destination).</summary>
    Route,

    /// <summary>Quick place lookup by stable external ID.</summary>
    QuickPlace
}

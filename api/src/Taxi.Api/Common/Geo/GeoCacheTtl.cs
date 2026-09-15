using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Common.Geo;

/// <summary>Per-kind TTL constants for the geo-provider response cache.
/// Shared between <see cref="Infrastructure.Geo.GeoCache"/> (serving reads) and
/// the <c>GeoCacheCleanupJob</c> (sweeping expired rows).
/// Centralised here so both consumers stay in sync — do NOT duplicate the constants.</summary>
internal static class GeoCacheTtl
{
    private static readonly TimeSpan SuggestTtl  = TimeSpan.FromDays(7);
    private static readonly TimeSpan GeocodeTtl  = TimeSpan.FromDays(30);
    private static readonly TimeSpan ReverseTtl  = TimeSpan.FromDays(30);
    private static readonly TimeSpan RouteTtl    = TimeSpan.FromHours(24);
    // QuickPlace: null → never expires (invalidated only on Place edit, never swept).

    /// <summary>Returns the configured TTL for the given geo cache <paramref name="kind"/>,
    /// or <see langword="null"/> for <see cref="GeoCacheKind.QuickPlace"/> (infinite lifetime).</summary>
    /// <param name="kind">The geo-provider call kind.</param>
    public static TimeSpan? ForKind(GeoCacheKind kind) =>
        kind switch
        {
            GeoCacheKind.Suggest    => SuggestTtl,
            GeoCacheKind.Geocode    => GeocodeTtl,
            GeoCacheKind.Reverse    => ReverseTtl,
            GeoCacheKind.Route      => RouteTtl,
            GeoCacheKind.QuickPlace => null,
            _                       => GeocodeTtl // safe default: 30-day TTL
        };

    /// <summary>All geo-cache kinds that are subject to TTL-based sweeping.
    /// <see cref="GeoCacheKind.QuickPlace"/> is intentionally excluded — it is never
    /// swept by the cleanup job; it is only invalidated explicitly on Place edits.</summary>
    internal static readonly GeoCacheKind[] SweptKinds =
    [
        GeoCacheKind.Suggest,
        GeoCacheKind.Geocode,
        GeoCacheKind.Reverse,
        GeoCacheKind.Route
    ];
}

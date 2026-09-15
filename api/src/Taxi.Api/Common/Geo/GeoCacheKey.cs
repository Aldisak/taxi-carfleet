using System.Globalization;
using System.Text;

namespace Taxi.Api.Common.Geo;

/// <summary>Produces deterministic cache-key strings for each Mapy.com query kind.
/// Rules per spec §3:
/// <list type="bullet">
///   <item>Suggest: lowercase + trim + diacritics-folded query, plus near-coordinate rounded to 2 decimals.</item>
///   <item>Geocode: lowercase + trim + diacritics-folded query only.</item>
///   <item>Reverse: lat/lng rounded to 4 decimal places (invariant-culture formatted).</item>
///   <item>Route: from+to lat/lng each rounded to 4 decimal places.</item>
/// </list>
/// All methods are pure and culture-invariant — no I/O, no DI
/// (architecture.md#common-infrastructure).</summary>
public static class GeoCacheKey
{
    /// <summary>Builds a cache key for a suggest (autocomplete) query.
    /// The optional <paramref name="near"/> coordinate is rounded to 2 decimal places and
    /// appended after a separator when supplied.</summary>
    /// <param name="q">The raw user-typed query string.</param>
    /// <param name="near">Optional near-coordinate hint (lat, lng) for location-biased results.</param>
    public static string Suggest(string q, (double Lat, double Lng)? near)
    {
        var folded = FoldQuery(q);
        if (near is not { } n) return folded;

        var lat = Round2(n.Lat);
        var lng = Round2(n.Lng);
        return $"{folded}|{lat.ToString("F2", CultureInfo.InvariantCulture)},{lng.ToString("F2", CultureInfo.InvariantCulture)}";
    }

    /// <summary>Builds a cache key for a geocode (full-text → coordinates) query.</summary>
    /// <param name="q">The raw query string.</param>
    public static string Geocode(string q) => FoldQuery(q);

    /// <summary>Builds a cache key for a reverse-geocode (coordinates → address) request.
    /// Both values are rounded to 4 decimal places using invariant-culture formatting.</summary>
    /// <param name="lat">Latitude in decimal degrees.</param>
    /// <param name="lng">Longitude in decimal degrees.</param>
    public static string Reverse(double lat, double lng) =>
        $"{Round4(lat).ToString("F4", CultureInfo.InvariantCulture)},{Round4(lng).ToString("F4", CultureInfo.InvariantCulture)}";

    /// <summary>Builds a cache key for a routing (point-to-point) request.
    /// All four coordinates are rounded to 4 decimal places using invariant-culture formatting.</summary>
    /// <param name="fromLat">Origin latitude.</param>
    /// <param name="fromLng">Origin longitude.</param>
    /// <param name="toLat">Destination latitude.</param>
    /// <param name="toLng">Destination longitude.</param>
    public static string Route(double fromLat, double fromLng, double toLat, double toLng) =>
        $"{Round4(fromLat).ToString("F4", CultureInfo.InvariantCulture)},{Round4(fromLng).ToString("F4", CultureInfo.InvariantCulture)}" +
        $"|{Round4(toLat).ToString("F4", CultureInfo.InvariantCulture)},{Round4(toLng).ToString("F4", CultureInfo.InvariantCulture)}";

    // ── private helpers ───────────────────────────────────────────────────────

    /// <summary>Folds a query string: trims whitespace, lowercases with invariant culture,
    /// and strips diacritics via Unicode NFD decomposition + NonSpacingMark removal.</summary>
    /// <param name="q">Raw query string.</param>
    private static string FoldQuery(string q)
    {
        var trimmed = q.Trim().ToLowerInvariant();
        var normalized = trimmed.Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder(normalized.Length);
        foreach (var c in normalized)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
                sb.Append(c);
        }
        return sb.ToString().Normalize(NormalizationForm.FormC);
    }

    /// <summary>Rounds to 2 decimal places using <see cref="MidpointRounding.AwayFromZero"/>.</summary>
    /// <param name="value">Value to round.</param>
    private static double Round2(double value) =>
        Math.Round(value, 2, MidpointRounding.AwayFromZero);

    /// <summary>Rounds to 4 decimal places using <see cref="MidpointRounding.AwayFromZero"/>.</summary>
    /// <param name="value">Value to round.</param>
    private static double Round4(double value) =>
        Math.Round(value, 4, MidpointRounding.AwayFromZero);
}

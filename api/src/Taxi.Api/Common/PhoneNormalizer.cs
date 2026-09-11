using System.Text.RegularExpressions;

namespace Taxi.Api.Common;

/// <summary>Normalizes phone numbers to E.164 format. Czech-first: bare 9-digit numbers are treated
/// as Czech numbers and prefixed with +420. Numbers already carrying a country code are validated
/// and passed through. Un-normalizable input returns false.</summary>
internal static partial class PhoneNormalizer
{
    // Matches exactly 9 digits — a Czech local number without country code.
    [GeneratedRegex(@"^\d{9}$")]
    private static partial Regex CzechLocalRegex();

    // Matches a full E.164 number: + followed by 7–15 digits (per ITU-T E.164).
    [GeneratedRegex(@"^\+\d{7,15}$")]
    private static partial Regex E164Regex();

    /// <summary>Attempts to normalize <paramref name="raw"/> to E.164 format.
    /// Returns <c>true</c> and sets <paramref name="normalized"/> on success;
    /// returns <c>false</c> and sets <paramref name="normalized"/> to <c>null</c> on failure.</summary>
    /// <param name="raw">Raw phone string from the client (may include spaces or dashes).</param>
    /// <param name="normalized">The normalized E.164 string if successful; otherwise null.</param>
    /// <returns><c>true</c> if normalization succeeded; otherwise <c>false</c>.</returns>
    public static bool TryNormalize(string? raw, out string? normalized)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            normalized = null;
            return false;
        }

        // Strip spaces and dashes for flexible input.
        var cleaned = raw.Replace(" ", "").Replace("-", "");

        // Already E.164?
        if (E164Regex().IsMatch(cleaned))
        {
            normalized = cleaned;
            return true;
        }

        // Bare 9-digit Czech number → prepend +420.
        if (CzechLocalRegex().IsMatch(cleaned))
        {
            normalized = "+420" + cleaned;
            return true;
        }

        normalized = null;
        return false;
    }
}

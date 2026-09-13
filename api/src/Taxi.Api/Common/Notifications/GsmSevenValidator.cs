namespace Taxi.Api.Common.Notifications;

/// <summary>Validates that a rendered SMS body fits a single 160-character GSM-7 message: every
/// character must be in the GSM-7 basic or extension set (no diacritics) and the total rendered
/// length (counting extension characters as two septets) must be ≤ 160.</summary>
public static class GsmSevenValidator
{
    /// <summary>Maximum septets in a single GSM-7 SMS.</summary>
    public const int SingleSmsLimit = 160;

    // GSM 03.38 basic character set.
    private const string BasicSet =
        "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ ÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
        "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";

    // GSM 03.38 extension set — each of these costs two septets.
    private const string ExtensionSet = "^{}\\[~]|€";

    /// <summary>Returns true when every character is GSM-7 encodable and the message fits one SMS.</summary>
    /// <param name="message">The rendered SMS body.</param>
    public static bool IsGsm7AndWithinLimit(string message)
    {
        if (message is null) return false;

        var septets = 0;
        foreach (var ch in message)
        {
            if (BasicSet.Contains(ch))
            {
                septets += 1;
            }
            else if (ExtensionSet.Contains(ch))
            {
                septets += 2;
            }
            else
            {
                // Not representable in GSM-7 (e.g. a Czech diacritic).
                return false;
            }

            if (septets > SingleSmsLimit) return false;
        }

        return septets <= SingleSmsLimit;
    }
}

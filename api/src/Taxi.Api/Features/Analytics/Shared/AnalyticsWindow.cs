using System.Globalization;

namespace Taxi.Api.Features.Analytics.Shared;

/// <summary>Resolves Prague-local date strings into UTC window boundaries and computes prior-period windows
/// for analytics comparison. Shared by all analytics endpoints.</summary>
internal static class AnalyticsWindow
{
    private static readonly TimeZoneInfo PragueZone =
        TimeZoneInfo.FindSystemTimeZoneById("Europe/Prague");

    /// <summary>Resolves the current analytics window from request parameters (defaulting to this Prague month)
    /// and optionally computes the prior equal-length window for compare mode.</summary>
    /// <param name="fromStr">ISO date string (yyyy-MM-dd) or null to default to the 1st of the current Prague month.</param>
    /// <param name="toStr">ISO date string (yyyy-MM-dd) or null to default to today in Prague.</param>
    /// <param name="compare">When true, computes the prior window of equal length immediately before the current window.</param>
    /// <param name="now">The current instant (from injected TimeProvider) used only for defaults.</param>
    /// <returns>Resolved UTC window boundaries and optional prior window.</returns>
    public static (DateTimeOffset WinStart, DateTimeOffset WinEnd,
                   DateTimeOffset? PriorStart, DateTimeOffset? PriorEnd)
        Resolve(string? fromStr, string? toStr, bool compare, DateTimeOffset now)
    {
        // Convert current instant to Prague local to determine defaults.
        var pragueNow = TimeZoneInfo.ConvertTime(now, PragueZone);
        var todayPrague = DateOnly.FromDateTime(pragueNow.DateTime);
        var firstOfMonthPrague = new DateOnly(todayPrague.Year, todayPrague.Month, 1);

        var fromDate = fromStr is not null
            ? DateOnly.ParseExact(fromStr, "yyyy-MM-dd", CultureInfo.InvariantCulture)
            : firstOfMonthPrague;

        var toDate = toStr is not null
            ? DateOnly.ParseExact(toStr, "yyyy-MM-dd", CultureInfo.InvariantCulture)
            : todayPrague;

        var winStart = ToUtc(fromDate);
        var winEnd = ToUtc(toDate.AddDays(1));

        if (!compare)
            return (winStart, winEnd, null, null);

        // Prior period = immediately preceding equal-length window.
        var span = winEnd - winStart;
        var priorEnd = winStart;
        var priorStart = priorEnd - span;

        return (winStart, winEnd, priorStart, priorEnd);
    }

    /// <summary>Maps a granularity string to the Postgres <c>date_trunc</c> unit.</summary>
    /// <param name="granularity">One of "day", "week", or "month" (case-insensitive).</param>
    /// <returns>The Postgres date_trunc unit string.</returns>
    public static string TruncUnit(string? granularity) => granularity?.ToLowerInvariant() switch
    {
        "week" => "week",
        "month" => "month",
        _ => "day"
    };

    /// <summary>Converts a Prague calendar day boundary to its UTC instant.</summary>
    /// <param name="pragueDay">The Prague calendar day.</param>
    private static DateTimeOffset ToUtc(DateOnly pragueDay)
    {
        var local = pragueDay.ToDateTime(TimeOnly.MinValue);
        return new DateTimeOffset(TimeZoneInfo.ConvertTimeToUtc(local, PragueZone), TimeSpan.Zero);
    }
}

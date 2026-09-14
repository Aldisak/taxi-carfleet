namespace Taxi.Api.Features.Analytics.Shared;

/// <summary>Shared query parameters used by all analytics endpoints.
/// <c>from</c> and <c>to</c> are ISO 8601 date strings (yyyy-MM-dd, Prague local calendar days).
/// Defaults to the first and last day of the current Prague month when omitted.</summary>
public record AnalyticsRangeRequest
{
    /// <summary>Inclusive start date (yyyy-MM-dd, Prague calendar day). Defaults to this month's first day.</summary>
    public string? From { get; init; }

    /// <summary>Inclusive end date (yyyy-MM-dd, Prague calendar day). Defaults to today in Prague.</summary>
    public string? To { get; init; }

    /// <summary>Trend series bucket granularity: <c>day</c>, <c>week</c>, or <c>month</c>. Defaults to <c>day</c>.</summary>
    public string? Granularity { get; init; }

    /// <summary>When <c>true</c>, computes KPIs for the immediately preceding equal-length period
    /// and includes delta values. Defaults to <c>false</c>.</summary>
    public bool Compare { get; init; }
}

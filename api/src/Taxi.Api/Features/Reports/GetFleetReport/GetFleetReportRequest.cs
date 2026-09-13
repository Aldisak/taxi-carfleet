namespace Taxi.Api.Features.Reports.GetFleetReport;

/// <summary>Request for GET /reports/fleet?from&amp;to.</summary>
public sealed class GetFleetReportRequest
{
    /// <summary>Inclusive range start, <c>yyyy-MM-dd</c> (Europe/Prague day).</summary>
    public string? From { get; set; }

    /// <summary>Inclusive range end, <c>yyyy-MM-dd</c> (Europe/Prague day).</summary>
    public string? To { get; set; }
}

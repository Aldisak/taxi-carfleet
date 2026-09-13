namespace Taxi.Api.Features.Reports.GetDriverReport;

/// <summary>Request for GET /reports/drivers?driverId&amp;from&amp;to&amp;format.</summary>
public sealed class GetDriverReportRequest
{
    /// <summary>Driver whose report is requested.</summary>
    public Guid DriverId { get; set; }

    /// <summary>Inclusive range start, <c>yyyy-MM-dd</c> (Europe/Prague day).</summary>
    public string? From { get; set; }

    /// <summary>Inclusive range end, <c>yyyy-MM-dd</c> (Europe/Prague day).</summary>
    public string? To { get; set; }

    /// <summary>Optional export format. <c>csv</c> returns a UTF-8-BOM ';'-separated CSV body;
    /// absent returns JSON.</summary>
    public string? Format { get; set; }
}

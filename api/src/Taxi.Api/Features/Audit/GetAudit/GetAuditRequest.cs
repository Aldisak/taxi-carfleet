namespace Taxi.Api.Features.Audit.GetAudit;

/// <summary>Request for GET /audit?actor&amp;entity&amp;from&amp;to&amp;orderCode&amp;page&amp;pageSize.</summary>
public sealed class GetAuditRequest
{
    /// <summary>Optional actor user id filter.</summary>
    public Guid? Actor { get; set; }

    /// <summary>Optional entity-name filter (e.g. "Order", "Vehicle", "Route").</summary>
    public string? Entity { get; set; }

    /// <summary>Optional inclusive range start, <c>yyyy-MM-dd</c> (Europe/Prague day).</summary>
    public string? From { get; set; }

    /// <summary>Optional inclusive range end, <c>yyyy-MM-dd</c> (Europe/Prague day).</summary>
    public string? To { get; set; }

    /// <summary>Optional order public-code filter (exact match).</summary>
    public string? OrderCode { get; set; }

    /// <summary>1-based page number. Defaults to 1.</summary>
    public int Page { get; set; } = 1;

    /// <summary>Page size (1..200). Defaults to 50.</summary>
    public int PageSize { get; set; } = 50;
}

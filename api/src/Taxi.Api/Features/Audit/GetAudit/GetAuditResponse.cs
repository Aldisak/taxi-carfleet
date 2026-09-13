namespace Taxi.Api.Features.Audit.GetAudit;

/// <summary>Paged audit timeline payload.</summary>
/// <param name="Items">The merged, descending-by-time entries for the requested page.</param>
/// <param name="Total">Total number of matching entries across both sources.</param>
/// <param name="Page">The 1-based page number returned.</param>
/// <param name="PageSize">The page size used.</param>
public record GetAuditResponse(
    IReadOnlyList<AuditEntryDto> Items,
    int Total,
    int Page,
    int PageSize);

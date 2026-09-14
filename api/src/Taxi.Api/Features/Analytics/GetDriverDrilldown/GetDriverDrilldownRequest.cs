using Taxi.Api.Features.Analytics.Shared;

namespace Taxi.Api.Features.Analytics.GetDriverDrilldown;

/// <summary>Request for GET /api/v1/analytics/drivers/{id} — driver drill-down analytics.</summary>
public record GetDriverDrilldownRequest : AnalyticsRangeRequest
{
    /// <summary>Driver entity ID from the route segment.</summary>
    public Guid Id { get; init; }
}

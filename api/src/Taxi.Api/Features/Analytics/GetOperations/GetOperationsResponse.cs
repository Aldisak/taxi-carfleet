namespace Taxi.Api.Features.Analytics.GetOperations;

/// <summary>Response for GET /api/v1/analytics/operations — operational SLA, offer funnel, lifecycle conversion,
/// and cancellation breakdown for the fleet.</summary>
/// <param name="Sla">SLA percentile series (p50/p90) for the four key time intervals.</param>
/// <param name="OfferFunnel">Offer funnel: offers made, accepted, declined, timeouts, and average per completed ride.</param>
/// <param name="Lifecycle">Lifecycle conversion funnel: count of orders at each stage.</param>
/// <param name="Cancellations">Cancellation breakdown by role, status-at-cancel, Prague hour-of-day, and no-show share.</param>
/// <param name="Prior">All sections recomputed for the prior equal-length period (null when compare=false).</param>
public record GetOperationsResponse(
    OperationsSlaDto Sla,
    OfferFunnelDto OfferFunnel,
    LifecycleFunnelDto Lifecycle,
    CancellationBreakdownDto Cancellations,
    GetOperationsPriorDto? Prior = null);

/// <summary>All operations sections recomputed for the prior equal-length period (only when compare=true).</summary>
/// <param name="Sla">SLA percentile series for the prior period.</param>
/// <param name="OfferFunnel">Offer funnel for the prior period.</param>
/// <param name="Lifecycle">Lifecycle funnel for the prior period.</param>
/// <param name="Cancellations">Cancellation breakdown for the prior period.</param>
public record GetOperationsPriorDto(
    OperationsSlaDto Sla,
    OfferFunnelDto OfferFunnel,
    LifecycleFunnelDto Lifecycle,
    CancellationBreakdownDto Cancellations);

/// <summary>SLA percentile metrics (p50/p90) for the four key time intervals in the window.</summary>
/// <param name="TimeToAssign">Time from order creation to first driver assignment (created_at → assigned_at).
/// Null when no orders in the window have both endpoints non-null.</param>
/// <param name="TimeToAccept">Time from assignment to driver acceptance (assigned_at → accepted_at).
/// Null when no qualifying rows exist.</param>
/// <param name="TimeToPickup">Time from acceptance to driver arrival at pickup (accepted_at → arrived_at).
/// Null when no qualifying rows exist.</param>
/// <param name="RideDuration">Time from ride start to completion (started_at → completed_at).
/// Null when no qualifying rows exist.</param>
public record OperationsSlaDto(
    SlaPercentileDto? TimeToAssign,
    SlaPercentileDto? TimeToAccept,
    SlaPercentileDto? TimeToPickup,
    SlaPercentileDto? RideDuration);

/// <summary>Percentile statistics for one SLA metric.</summary>
/// <param name="Median">p50 (median) duration in seconds.</param>
/// <param name="P90">p90 duration in seconds.</param>
/// <param name="SampleCount">Number of orders contributing to this metric (rows where both interval endpoints are non-null).</param>
public record SlaPercentileDto(double Median, double P90, int SampleCount);

/// <summary>Offer funnel: how many offers were made, how many were accepted/declined/timed out, and the average number
/// of offers per completed ride.</summary>
/// <param name="OffersMade">Total offer events (Assigned + Reassigned) in the window.</param>
/// <param name="Accepted">Total Accepted events in the window.</param>
/// <param name="Declined">Total Declined events in the window.</param>
/// <param name="Timeouts">Total Timeout events in the window.</param>
/// <param name="AvgOffersPerCompleted">Average number of offer events per completed ride (0.0 when no completed rides).</param>
public record OfferFunnelDto(
    int OffersMade,
    int Accepted,
    int Declined,
    int Timeouts,
    double AvgOffersPerCompleted);

/// <summary>Lifecycle conversion funnel: count of orders that reached each stage within the window.</summary>
/// <param name="Created">Total orders created in the window.</param>
/// <param name="Assigned">Orders that have a non-null assigned_at.</param>
/// <param name="Accepted">Orders that have a non-null accepted_at.</param>
/// <param name="Arrived">Orders that have a non-null arrived_at.</param>
/// <param name="InProgress">Orders that have a non-null started_at.</param>
/// <param name="Completed">Orders with status = Completed.</param>
public record LifecycleFunnelDto(
    int Created,
    int Assigned,
    int Accepted,
    int Arrived,
    int InProgress,
    int Completed);

/// <summary>Cancellation breakdown by multiple dimensions.</summary>
/// <param name="ByRole">Cancellation count grouped by the role of the cancelling actor (Driver/Dispatcher/Customer/System).</param>
/// <param name="ByStatusAtCancel">Cancellation count grouped by the order status at time of cancellation (from_status on the Cancelled event).</param>
/// <param name="ByHour">Cancellation count grouped by Prague hour-of-day (0–23) of the cancellation event.</param>
/// <param name="NoShowShare">Fraction of cancellations that occurred after the driver had already arrived (Arrived status; 0.0 when no cancellations).</param>
public record CancellationBreakdownDto(
    List<CancellationByRoleDto> ByRole,
    List<CancellationByStatusDto> ByStatusAtCancel,
    List<CancellationByHourDto> ByHour,
    double NoShowShare);

/// <summary>Cancellation count for one cancelling role.</summary>
/// <param name="Role">Actor role string (e.g. "Dispatcher", "Driver", "Customer").</param>
/// <param name="Count">Number of cancellations by this role.</param>
public record CancellationByRoleDto(string Role, int Count);

/// <summary>Cancellation count for one status-at-cancellation.</summary>
/// <param name="Status">Order status at time of cancellation (e.g. "Assigned", "Arrived").</param>
/// <param name="Count">Number of cancellations from this status.</param>
public record CancellationByStatusDto(string Status, int Count);

/// <summary>Cancellation count for one Prague hour-of-day.</summary>
/// <param name="Hour">Prague local hour-of-day (0–23).</param>
/// <param name="Count">Number of cancellations occurring in this hour.</param>
public record CancellationByHourDto(int Hour, int Count);

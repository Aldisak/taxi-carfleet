using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Features.Analytics.Shared;
using Taxi.Api.Infrastructure;

namespace Taxi.Api.Features.Analytics.GetOperations;

/// <summary>Returns operational analytics for the fleet: SLA p50/p90 series for the four key time intervals
/// (time-to-assign, time-to-accept, time-to-pickup, ride duration), offer funnel from order events,
/// lifecycle conversion funnel, and cancellation breakdown by role, status-at-cancel, Prague hour-of-day,
/// and no-show share. compare=true recomputes all sections for the prior equal-length period.</summary>
internal sealed class GetOperationsEndpoint(TaxiDbContext dbContext, ICurrentTenant currentTenant, TimeProvider timeProvider)
    : Endpoint<AnalyticsRangeRequest, GetOperationsResponse>
{
    private readonly AnalyticsFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Get("analytics/operations");
        Description(builder => builder
            .WithName(nameof(GetOperationsEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.FleetAdminOnly));

        Summary(s =>
        {
            s.Summary = "Operational SLA, funnel & cancellation analytics (FleetAdmin)";
            s.Description =
                "SLA p50/p90 for time-to-assign (created→assigned), time-to-accept (assigned→accepted), " +
                "time-to-pickup (accepted→arrived), and ride duration (started→completed) — each metric " +
                "filters to orders where BOTH interval endpoints are non-null. Offer funnel from order_events: " +
                "Assigned+Reassigned=offers made, Accepted, Declined, Timeout, and average offers per completed ride. " +
                "Lifecycle conversion funnel (created→assigned→accepted→arrived→in-progress→completed counts). " +
                "Cancellation breakdown by cancelling role, by order status at time of cancel, by Prague hour-of-day, " +
                "and no-show share (cancelled after driver arrived). compare=true recomputes all sections for the prior equal-length period.";
            s.Responses[StatusCodes.Status200OK] = "Operations analytics.";
            s.Responses[StatusCodes.Status400BadRequest] = "Invalid date, range, or granularity.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a fleet admin.";
            s.Responses[StatusCodes.Status404NotFound] = "No fleet resolved for the request.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(AnalyticsRangeRequest req, CancellationToken ct)
    {
        if (currentTenant.FleetId is not Guid fleetId) { await Send.NotFoundAsync(ct); return; }

        var (winStart, winEnd, priorStart, priorEnd) =
            AnalyticsWindow.Resolve(req.From, req.To, req.Compare, timeProvider.GetUtcNow());

        var sla = await ComputeSlaAsync(fleetId, winStart, winEnd, ct);
        var offerFunnel = await ComputeOfferFunnelAsync(fleetId, winStart, winEnd, ct);
        var lifecycle = await ComputeLifecycleFunnelAsync(fleetId, winStart, winEnd, ct);
        var cancellations = await ComputeCancellationBreakdownAsync(fleetId, winStart, winEnd, ct);

        GetOperationsPriorDto? prior = null;
        if (req.Compare && priorStart is not null && priorEnd is not null)
        {
            prior = new GetOperationsPriorDto(
                Sla: await ComputeSlaAsync(fleetId, priorStart.Value, priorEnd.Value, ct),
                OfferFunnel: await ComputeOfferFunnelAsync(fleetId, priorStart.Value, priorEnd.Value, ct),
                Lifecycle: await ComputeLifecycleFunnelAsync(fleetId, priorStart.Value, priorEnd.Value, ct),
                Cancellations: await ComputeCancellationBreakdownAsync(fleetId, priorStart.Value, priorEnd.Value, ct));
        }

        await Send.OkAsync(new GetOperationsResponse(sla, offerFunnel, lifecycle, cancellations, prior), ct);
    }

    // ── SLA: percentile_cont p50/p90 for the four key intervals ──────────────
    // Each metric independently filters to rows where BOTH interval endpoints are non-null.
    // Property names use single-word or clean two-segment names (Trap A: no digit-after-letter boundaries).
    // All EXTRACT results are cast ::float8 for percentile, COUNT cast ::int.

    private async Task<OperationsSlaDto> ComputeSlaAsync(
        Guid fleetId, DateTimeOffset winStart, DateTimeOffset winEnd, CancellationToken ct)
    {
        var timeToAssign = await ComputeTimeToAssignAsync(fleetId, winStart, winEnd, ct);
        var timeToAccept = await ComputeTimeToAcceptAsync(fleetId, winStart, winEnd, ct);
        var timeToPickup = await ComputeTimeToPickupAsync(fleetId, winStart, winEnd, ct);
        var rideDuration = await ComputeRideDurationAsync(fleetId, winStart, winEnd, ct);

        return new OperationsSlaDto(timeToAssign, timeToAccept, timeToPickup, rideDuration);
    }

    private async Task<SlaPercentileDto?> ComputeTimeToAssignAsync(
        Guid fleetId, DateTimeOffset winStart, DateTimeOffset winEnd, CancellationToken ct)
    {
        var rows = await dbContext.Database.SqlQuery<SlaRow>(
            $"""
             SELECT
                 percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (assigned_at - created_at))::float8) AS "median",
                 percentile_cont(0.9) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (assigned_at - created_at))::float8) AS "p90",
                 COUNT(*)::int AS "sample_count"
             FROM orders
             WHERE fleet_id = {fleetId}
               AND created_at >= {winStart}
               AND created_at < {winEnd}
               AND created_at IS NOT NULL
               AND assigned_at IS NOT NULL
             """).ToListAsync(ct);
        return ToSlaDto(rows);
    }

    private async Task<SlaPercentileDto?> ComputeTimeToAcceptAsync(
        Guid fleetId, DateTimeOffset winStart, DateTimeOffset winEnd, CancellationToken ct)
    {
        var rows = await dbContext.Database.SqlQuery<SlaRow>(
            $"""
             SELECT
                 percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (accepted_at - assigned_at))::float8) AS "median",
                 percentile_cont(0.9) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (accepted_at - assigned_at))::float8) AS "p90",
                 COUNT(*)::int AS "sample_count"
             FROM orders
             WHERE fleet_id = {fleetId}
               AND created_at >= {winStart}
               AND created_at < {winEnd}
               AND assigned_at IS NOT NULL
               AND accepted_at IS NOT NULL
             """).ToListAsync(ct);
        return ToSlaDto(rows);
    }

    private async Task<SlaPercentileDto?> ComputeTimeToPickupAsync(
        Guid fleetId, DateTimeOffset winStart, DateTimeOffset winEnd, CancellationToken ct)
    {
        var rows = await dbContext.Database.SqlQuery<SlaRow>(
            $"""
             SELECT
                 percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (arrived_at - accepted_at))::float8) AS "median",
                 percentile_cont(0.9) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (arrived_at - accepted_at))::float8) AS "p90",
                 COUNT(*)::int AS "sample_count"
             FROM orders
             WHERE fleet_id = {fleetId}
               AND created_at >= {winStart}
               AND created_at < {winEnd}
               AND accepted_at IS NOT NULL
               AND arrived_at IS NOT NULL
             """).ToListAsync(ct);
        return ToSlaDto(rows);
    }

    private async Task<SlaPercentileDto?> ComputeRideDurationAsync(
        Guid fleetId, DateTimeOffset winStart, DateTimeOffset winEnd, CancellationToken ct)
    {
        var rows = await dbContext.Database.SqlQuery<SlaRow>(
            $"""
             SELECT
                 percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_at - started_at))::float8) AS "median",
                 percentile_cont(0.9) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_at - started_at))::float8) AS "p90",
                 COUNT(*)::int AS "sample_count"
             FROM orders
             WHERE fleet_id = {fleetId}
               AND created_at >= {winStart}
               AND created_at < {winEnd}
               AND started_at IS NOT NULL
               AND completed_at IS NOT NULL
             """).ToListAsync(ct);
        return ToSlaDto(rows);
    }

    private static SlaPercentileDto? ToSlaDto(List<SlaRow> rows)
    {
        if (rows.Count == 0 || rows[0].SampleCount == 0) return null;
        var r = rows[0];
        // Median and P90 can be null when percentile_cont is given an empty set.
        // SampleCount guard above prevents this, but null-coalesce defensively.
        return new SlaPercentileDto(r.Median ?? 0.0, r.P90 ?? 0.0, r.SampleCount);
    }

    // ── Offer funnel: Assigned+Reassigned=offers, Accepted, Declined, Timeout ─
    // Queries order_events table grouped by type in the window.
    // AvgOffersPerCompleted = (Assigned+Reassigned events for completed orders) / count(distinct completed orders).

    private async Task<OfferFunnelDto> ComputeOfferFunnelAsync(
        Guid fleetId, DateTimeOffset winStart, DateTimeOffset winEnd, CancellationToken ct)
    {
        // Aggregate event type counts in the window from order_events.
        var typeRows = await dbContext.Database.SqlQuery<EventTypeCountRow>(
            $"""
             SELECT oe.type AS "evtype",
                    COUNT(*)::int AS "count"
             FROM order_events oe
             JOIN orders o ON o.id = oe.order_id
             WHERE oe.fleet_id = {fleetId}
               AND o.created_at >= {winStart}
               AND o.created_at < {winEnd}
               AND oe.type IN ('Assigned', 'Reassigned', 'Accepted', 'Declined', 'Timeout')
             GROUP BY oe.type
             """).ToListAsync(ct);

        var countByType = typeRows.ToDictionary(r => r.Evtype, r => r.Count);
        var offersMade = countByType.GetValueOrDefault("Assigned", 0)
                       + countByType.GetValueOrDefault("Reassigned", 0);
        var accepted = countByType.GetValueOrDefault("Accepted", 0);
        var declined = countByType.GetValueOrDefault("Declined", 0);
        var timeouts = countByType.GetValueOrDefault("Timeout", 0);

        // Average offers per completed ride:
        // offers for a completed ride = count of Assigned/Reassigned events on completed orders.
        var avgRow = await dbContext.Database.SqlQuery<AvgOffersRow>(
            $"""
             SELECT
                 COUNT(DISTINCT o.id)::int AS "completed",
                 COALESCE(SUM(CASE WHEN oe.type IN ('Assigned', 'Reassigned') THEN 1 ELSE 0 END), 0)::int AS "offers"
             FROM orders o
             LEFT JOIN order_events oe ON oe.order_id = o.id
                 AND oe.type IN ('Assigned', 'Reassigned')
             WHERE o.fleet_id = {fleetId}
               AND o.created_at >= {winStart}
               AND o.created_at < {winEnd}
               AND o.status = 'Completed'
             """).SingleAsync(ct);

        var avgOffersPerCompleted = avgRow.Completed > 0
            ? Math.Round((double)avgRow.Offers / avgRow.Completed, 4)
            : 0.0;

        return new OfferFunnelDto(offersMade, accepted, declined, timeouts, avgOffersPerCompleted);
    }

    // ── Lifecycle funnel: 6 stage counts ─────────────────────────────────────
    // All counts are from the orders table; each stage is a conditional COUNT.

    private async Task<LifecycleFunnelDto> ComputeLifecycleFunnelAsync(
        Guid fleetId, DateTimeOffset winStart, DateTimeOffset winEnd, CancellationToken ct)
    {
        var rows = await dbContext.Database.SqlQuery<LifecycleRow>(
            $"""
             SELECT
                 COUNT(*)::int                                              AS "created",
                 COUNT(*) FILTER (WHERE assigned_at IS NOT NULL)::int      AS "assigned",
                 COUNT(*) FILTER (WHERE accepted_at IS NOT NULL)::int      AS "accepted",
                 COUNT(*) FILTER (WHERE arrived_at IS NOT NULL)::int       AS "arrived",
                 COUNT(*) FILTER (WHERE started_at IS NOT NULL)::int       AS "inprogress",
                 COUNT(*) FILTER (WHERE status = 'Completed')::int         AS "completed"
             FROM orders
             WHERE fleet_id = {fleetId}
               AND created_at >= {winStart}
               AND created_at < {winEnd}
             """).ToListAsync(ct);

        if (rows.Count == 0)
            return new LifecycleFunnelDto(0, 0, 0, 0, 0, 0);

        var r = rows[0];
        return new LifecycleFunnelDto(r.Created, r.Assigned, r.Accepted, r.Arrived, r.Inprogress, r.Completed);
    }

    // ── Cancellation breakdown ────────────────────────────────────────────────
    // Three dimensions: by cancelled_by_role (orders table), by status-at-cancel (Cancelled event's from_status),
    // and by Prague hour-of-day of the cancellation. No-show = cancelled after Arrived status.

    private async Task<CancellationBreakdownDto> ComputeCancellationBreakdownAsync(
        Guid fleetId, DateTimeOffset winStart, DateTimeOffset winEnd, CancellationToken ct)
    {
        // By role: from cancelled_by_role on the orders table.
        var byRoleRows = await dbContext.Database.SqlQuery<CancelByRoleRow>(
            $"""
             SELECT cancelled_by_role AS "role",
                    COUNT(*)::int     AS "count"
             FROM orders
             WHERE fleet_id = {fleetId}
               AND created_at >= {winStart}
               AND created_at < {winEnd}
               AND status = 'Cancelled'
               AND cancelled_by_role IS NOT NULL
             GROUP BY cancelled_by_role
             ORDER BY COUNT(*) DESC
             """).ToListAsync(ct);

        // By status-at-cancel: from the FromStatus column on the Cancelled event.
        var byStatusRows = await dbContext.Database.SqlQuery<CancelByStatusRow>(
            $"""
             SELECT oe.from_status AS "fromstatus",
                    COUNT(*)::int  AS "count"
             FROM order_events oe
             JOIN orders o ON o.id = oe.order_id
             WHERE oe.fleet_id = {fleetId}
               AND o.created_at >= {winStart}
               AND o.created_at < {winEnd}
               AND oe.type = 'Cancelled'
               AND oe.from_status IS NOT NULL
             GROUP BY oe.from_status
             ORDER BY COUNT(*) DESC
             """).ToListAsync(ct);

        // By Prague hour-of-day of the cancellation event.
        var byHourRows = await dbContext.Database.SqlQuery<CancelByHourRow>(
            $"""
             SELECT EXTRACT(HOUR FROM oe.at AT TIME ZONE 'Europe/Prague')::int AS "hour",
                    COUNT(*)::int AS "count"
             FROM order_events oe
             JOIN orders o ON o.id = oe.order_id
             WHERE oe.fleet_id = {fleetId}
               AND o.created_at >= {winStart}
               AND o.created_at < {winEnd}
               AND oe.type = 'Cancelled'
             GROUP BY EXTRACT(HOUR FROM oe.at AT TIME ZONE 'Europe/Prague')
             ORDER BY 1
             """).ToListAsync(ct);

        // No-show share: cancellations where from_status = 'Arrived' / total cancellations.
        var totalCancelled = byRoleRows.Sum(r => r.Count);
        // Even if cancelled_by_role is null, the total via status count is authoritative:
        var totalFromStatusEvents = byStatusRows.Sum(r => r.Count);
        var noShowCount = byStatusRows.Where(r => r.Fromstatus == "Arrived").Sum(r => r.Count);

        // Use the event-based total as it's more reliable (includes rows where cancelled_by_role is null).
        var totalForShare = totalFromStatusEvents > 0 ? totalFromStatusEvents : totalCancelled;
        var noShowShare = totalForShare > 0
            ? Math.Round((double)noShowCount / totalForShare, 6)
            : 0.0;

        var byRole = byRoleRows.Select(r => new CancellationByRoleDto(r.Role, r.Count)).ToList();
        var byStatus = byStatusRows.Select(r => new CancellationByStatusDto(r.Fromstatus, r.Count)).ToList();
        var byHour = byHourRows.Select(r => new CancellationByHourDto(r.Hour, r.Count)).ToList();

        return new CancellationBreakdownDto(byRole, byStatus, byHour, noShowShare);
    }

    // ── Internal SQL row types ────────────────────────────────────────────────

    /// <summary>Row shape for a single-SLA percentile query.
    /// Median → "median", P90 → "p90", SampleCount → "sample_count" (Trap A: no digit-word boundary).
    /// Median and P90 are nullable because percentile_cont returns NULL when no qualifying rows exist.</summary>
    private sealed record SlaRow(double? Median, double? P90, int SampleCount);

    /// <summary>Row shape for event type count query.</summary>
    private sealed record EventTypeCountRow(string Evtype, int Count);

    /// <summary>Row shape for the average-offers-per-completed-ride query.</summary>
    private sealed record AvgOffersRow(int Completed, int Offers);

    /// <summary>Row shape for the lifecycle funnel query.
    /// Inprogress → "inprogress" (single word, no separator — Trap A).</summary>
    private sealed record LifecycleRow(int Created, int Assigned, int Accepted, int Arrived, int Inprogress, int Completed);

    /// <summary>Row shape for cancellations-by-role query.</summary>
    private sealed record CancelByRoleRow(string Role, int Count);

    /// <summary>Row shape for cancellations-by-status-at-cancel query.
    /// Fromstatus → "fromstatus" (Trap A: single word, no digit boundary).</summary>
    private sealed record CancelByStatusRow(string Fromstatus, int Count);

    /// <summary>Row shape for cancellations-by-hour query.</summary>
    private sealed record CancelByHourRow(int Hour, int Count);
}

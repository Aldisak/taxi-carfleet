using Taxi.Api.Common.Geo;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Common.Dispatch;

/// <summary>Pure, stateless helper that selects the nearest eligible driver from a collection of
/// <see cref="DriverCandidate"/> projections. Contains no I/O, no DI, and no EF references —
/// the same purity discipline as <c>OrderStateMachine</c> and <c>HaversineDistance</c>.</summary>
/// <remarks>
/// <para><b>Single-consumer placement note (design-review F-3):</b> this class lives in
/// <c>Common/Dispatch/</c> despite having a single consumer (<c>AutoDispatchJob</c>). Placement
/// is a conscious exception to the "2+ consumers" Common/ rule, mirroring the
/// <c>HaversineDistance</c> pure-helper precedent: keeping the eligibility predicate in a
/// DI-free, I/O-free module enables fast unit tests (no Testcontainers/Docker) that run before
/// the job's integration tests, satisfying the test-ordering ladder. A future reviewer should
/// treat this as a deliberate architecture decision, not an oversight.</para>
/// <para><b>Eligibility predicate (all must hold):</b>
/// <list type="bullet">
///   <item><see cref="DriverStatus.Free"/> status (the sole on-shift available status).</item>
///   <item><c>LastLat</c>, <c>LastLng</c>, and <c>LastPositionAt</c> all non-null.</item>
///   <item><c>LastPositionAt</c> &gt;= <c>now - staleThreshold</c> (fresh position).</item>
///   <item>Driver id not in <c>excludedDriverIds</c>.</item>
///   <item>Haversine distance from pickup &lt;= <c>maxRadiusKm * 1000</c> metres.</item>
/// </list>
/// </para>
/// <para><b>Selection rule:</b> among all eligible candidates, the one with the smallest
/// haversine distance to the pickup is returned. Ties (identical floating-point distance) are
/// broken by ascending <see cref="DriverCandidate.DriverId"/> so every call with the same inputs
/// returns the same winner regardless of collection enumeration order.</para>
/// </remarks>
internal static class NearestDriverSelector
{
    /// <summary>Returns the nearest eligible, non-excluded driver candidate, or <c>null</c> when
    /// none qualify.</summary>
    /// <param name="candidates">Collection of driver projections to evaluate.</param>
    /// <param name="pickupLat">Pickup latitude in decimal degrees (WGS-84).</param>
    /// <param name="pickupLng">Pickup longitude in decimal degrees (WGS-84).</param>
    /// <param name="maxRadiusKm">Maximum dispatch radius in kilometres (matches <c>FleetSettings.MaxOfferRadiusKm</c>).</param>
    /// <param name="now">Current UTC time used for position freshness evaluation.</param>
    /// <param name="staleThreshold">Age after which a last position report is considered stale;
    /// the caller passes <c>TimeSpan.FromMinutes(5)</c> to mirror <c>StalePositionJob.StaleThreshold</c>.
    /// This value is intentionally NOT hardcoded so tests can pass any threshold.</param>
    /// <param name="excludedDriverIds">Driver ids that must not be offered (e.g. drivers who already
    /// declined or timed out on this order, or drivers already holding a pending Assigned offer).</param>
    public static DriverCandidate? SelectNearest(
        IReadOnlyCollection<DriverCandidate> candidates,
        double pickupLat,
        double pickupLng,
        int maxRadiusKm,
        DateTimeOffset now,
        TimeSpan staleThreshold,
        IReadOnlySet<Guid> excludedDriverIds)
    {
        var maxDistanceMeters = maxRadiusKm * 1000.0;
        var freshnessThreshold = now - staleThreshold;

        return candidates
            .Where(c => IsEligible(c, freshnessThreshold, excludedDriverIds))
            .Select(c => (Candidate: c,
                          Distance: HaversineDistance.Meters(pickupLat, pickupLng, c.LastLat!.Value, c.LastLng!.Value)))
            .Where(t => t.Distance <= maxDistanceMeters)
            .OrderBy(t => t.Distance)
            .ThenBy(t => t.Candidate.DriverId)
            .Select(t => t.Candidate)
            .FirstOrDefault();
    }

    /// <summary>Returns true when the candidate passes all non-distance eligibility criteria:
    /// Free status, non-null fresh position, and not in the exclusion set.</summary>
    private static bool IsEligible(
        DriverCandidate candidate,
        DateTimeOffset freshnessThreshold,
        IReadOnlySet<Guid> excludedDriverIds)
        => candidate.Status == DriverStatus.Free
           && candidate.LastLat.HasValue
           && candidate.LastLng.HasValue
           && candidate.LastPositionAt.HasValue
           && candidate.LastPositionAt.Value >= freshnessThreshold
           && !excludedDriverIds.Contains(candidate.DriverId);
}

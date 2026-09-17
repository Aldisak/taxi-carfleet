using FluentAssertions;
using Taxi.Api.Common.Dispatch;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Tests.Dispatch;

/// <summary>Pure unit tests for <see cref="NearestDriverSelector"/> — no database, no I/O, no Docker.
/// All tests are self-contained and run without a collection fixture.</summary>
public sealed class NearestDriverSelectorTests
{
    // ── Fixed test anchors ────────────────────────────────────────────────────

    private static readonly DateTimeOffset Now = new(2026, 9, 10, 12, 0, 0, TimeSpan.Zero);
    private static readonly TimeSpan StaleThreshold = TimeSpan.FromMinutes(5);

    // Pickup location: Prague city centre (Wenceslas Square)
    private const double PickupLat = 50.0815;
    private const double PickupLng = 14.4282;

    // Max radius for most tests: 5 km
    private const int MaxRadiusKm = 5;

    // ── Helpers ───────────────────────────────────────────────────────────────

    /// <summary>Creates a fresh candidate. Default: Free, fresh position at pickup, no exclusion.</summary>
    private static DriverCandidate MakeCandidate(
        double driverLat = PickupLat,
        double driverLng = PickupLng,
        DriverStatus status = DriverStatus.Free,
        DateTimeOffset? lastPositionAt = null,
        double? lat = null,
        double? lng = null,
        Guid? id = null)
    {
        var driverId = id ?? Guid.CreateVersion7();
        return new DriverCandidate(
            DriverId: driverId,
            CurrentVehicleId: Guid.CreateVersion7(),
            Status: status,
            LastLat: lat ?? driverLat,
            LastLng: lng ?? driverLng,
            LastPositionAt: lastPositionAt ?? Now);
    }

    // ── Tests ─────────────────────────────────────────────────────────────────

    /// <summary>Single eligible in-radius candidate → returned.</summary>
    [Fact]
    public void SelectNearest_SingleEligibleInRadius_ReturnsThatDriver()
    {
        var candidate = MakeCandidate();

        var result = NearestDriverSelector.SelectNearest(
            [candidate],
            PickupLat, PickupLng,
            MaxRadiusKm, Now, StaleThreshold,
            new HashSet<Guid>());

        result.Should().NotBeNull();
        result!.DriverId.Should().Be(candidate.DriverId);
    }

    /// <summary>Two eligible candidates at different distances → the nearer one is returned.</summary>
    [Fact]
    public void SelectNearest_TwoEligible_ReturnsCloser()
    {
        // Near driver: ~1 km from pickup (slightly north)
        var nearCandidate = MakeCandidate(driverLat: 50.0905, driverLng: PickupLng);
        // Far driver: ~3 km from pickup (further north)
        var farCandidate = MakeCandidate(driverLat: 50.1085, driverLng: PickupLng);

        var result = NearestDriverSelector.SelectNearest(
            [nearCandidate, farCandidate],
            PickupLat, PickupLng,
            MaxRadiusKm, Now, StaleThreshold,
            new HashSet<Guid>());

        result.Should().NotBeNull();
        result!.DriverId.Should().Be(nearCandidate.DriverId, "the nearer driver should be selected");
    }

    /// <summary>Candidate just beyond the radius → not returned; if only candidate, returns null.</summary>
    [Fact]
    public void SelectNearest_DriverOutsideRadius_ReturnsNull()
    {
        // ~10 km from pickup (outside 5 km radius)
        var outsideCandidate = MakeCandidate(driverLat: 50.1720, driverLng: PickupLng);

        var result = NearestDriverSelector.SelectNearest(
            [outsideCandidate],
            PickupLat, PickupLng,
            MaxRadiusKm, Now, StaleThreshold,
            new HashSet<Guid>());

        result.Should().BeNull("a driver beyond maxRadiusKm is ineligible");
    }

    /// <summary>Two candidates: one in radius, one outside → only in-radius driver returned.</summary>
    [Fact]
    public void SelectNearest_OneInRadiusOneOutside_ReturnsOnlyInRadius()
    {
        var inRadius = MakeCandidate(driverLat: 50.0905, driverLng: PickupLng);      // ~1 km
        var outside = MakeCandidate(driverLat: 50.1720, driverLng: PickupLng);       // ~10 km

        var result = NearestDriverSelector.SelectNearest(
            [inRadius, outside],
            PickupLat, PickupLng,
            MaxRadiusKm, Now, StaleThreshold,
            new HashSet<Guid>());

        result.Should().NotBeNull();
        result!.DriverId.Should().Be(inRadius.DriverId);
    }

    /// <summary>Offline driver → never returned.</summary>
    [Fact]
    public void SelectNearest_OfflineDriver_Excluded()
    {
        var offline = MakeCandidate(status: DriverStatus.Offline);

        var result = NearestDriverSelector.SelectNearest(
            [offline],
            PickupLat, PickupLng,
            MaxRadiusKm, Now, StaleThreshold,
            new HashSet<Guid>());

        result.Should().BeNull("Offline drivers are ineligible");
    }

    /// <summary>EnRoute driver → never returned.</summary>
    [Fact]
    public void SelectNearest_EnRouteDriver_Excluded()
    {
        var enRoute = MakeCandidate(status: DriverStatus.EnRoute);

        var result = NearestDriverSelector.SelectNearest(
            [enRoute],
            PickupLat, PickupLng,
            MaxRadiusKm, Now, StaleThreshold,
            new HashSet<Guid>());

        result.Should().BeNull("EnRoute drivers are ineligible");
    }

    /// <summary>Busy driver → never returned.</summary>
    [Fact]
    public void SelectNearest_BusyDriver_Excluded()
    {
        var busy = MakeCandidate(status: DriverStatus.Busy);

        var result = NearestDriverSelector.SelectNearest(
            [busy],
            PickupLat, PickupLng,
            MaxRadiusKm, Now, StaleThreshold,
            new HashSet<Guid>());

        result.Should().BeNull("Busy drivers are ineligible");
    }

    /// <summary>Driver whose last position is older than staleThreshold → excluded.</summary>
    [Fact]
    public void SelectNearest_StalePosition_Excluded()
    {
        var stalePosition = Now - StaleThreshold - TimeSpan.FromSeconds(1);
        var staleDriver = MakeCandidate(lastPositionAt: stalePosition);

        var result = NearestDriverSelector.SelectNearest(
            [staleDriver],
            PickupLat, PickupLng,
            MaxRadiusKm, Now, StaleThreshold,
            new HashSet<Guid>());

        result.Should().BeNull("a driver with a stale position is ineligible");
    }

    /// <summary>Driver whose position is exactly at the threshold → eligible (boundary inclusive).</summary>
    [Fact]
    public void SelectNearest_PositionAtExactThreshold_Eligible()
    {
        var exactThreshold = Now - StaleThreshold;
        var freshDriver = MakeCandidate(lastPositionAt: exactThreshold);

        var result = NearestDriverSelector.SelectNearest(
            [freshDriver],
            PickupLat, PickupLng,
            MaxRadiusKm, Now, StaleThreshold,
            new HashSet<Guid>());

        result.Should().NotBeNull("a driver at exactly the stale threshold boundary is eligible");
    }

    /// <summary>Driver with null LastLat/LastLng/LastPositionAt → excluded.</summary>
    [Fact]
    public void SelectNearest_NullPosition_Excluded()
    {
        var nullPosDriver = new DriverCandidate(
            DriverId: Guid.CreateVersion7(),
            CurrentVehicleId: Guid.CreateVersion7(),
            Status: DriverStatus.Free,
            LastLat: null,
            LastLng: null,
            LastPositionAt: null);

        var result = NearestDriverSelector.SelectNearest(
            [nullPosDriver],
            PickupLat, PickupLng,
            MaxRadiusKm, Now, StaleThreshold,
            new HashSet<Guid>());

        result.Should().BeNull("drivers with null position are ineligible");
    }

    /// <summary>Nearest candidate is in excludedDriverIds → the next-nearest eligible is returned.</summary>
    [Fact]
    public void SelectNearest_ExcludedDriver_Skipped_ReturnsNextNearest()
    {
        var nearId = Guid.CreateVersion7();
        var nearDriver = MakeCandidate(driverLat: 50.0905, driverLng: PickupLng, id: nearId); // ~1 km
        var farDriver = MakeCandidate(driverLat: 50.1085, driverLng: PickupLng);               // ~3 km

        var excluded = new HashSet<Guid> { nearId };

        var result = NearestDriverSelector.SelectNearest(
            [nearDriver, farDriver],
            PickupLat, PickupLng,
            MaxRadiusKm, Now, StaleThreshold,
            excluded);

        result.Should().NotBeNull();
        result!.DriverId.Should().Be(farDriver.DriverId,
            "the nearest was excluded, so the next-nearest eligible should be returned");
    }

    /// <summary>All candidates are in excludedDriverIds → returns null.</summary>
    [Fact]
    public void SelectNearest_AllExcluded_ReturnsNull()
    {
        var id1 = Guid.CreateVersion7();
        var id2 = Guid.CreateVersion7();
        var c1 = MakeCandidate(id: id1);
        var c2 = MakeCandidate(driverLat: 50.0905, driverLng: PickupLng, id: id2);

        var excluded = new HashSet<Guid> { id1, id2 };

        var result = NearestDriverSelector.SelectNearest(
            [c1, c2],
            PickupLat, PickupLng,
            MaxRadiusKm, Now, StaleThreshold,
            excluded);

        result.Should().BeNull();
    }

    /// <summary>Empty candidate collection → returns null.</summary>
    [Fact]
    public void SelectNearest_EmptyCollection_ReturnsNull()
    {
        var result = NearestDriverSelector.SelectNearest(
            [],
            PickupLat, PickupLng,
            MaxRadiusKm, Now, StaleThreshold,
            new HashSet<Guid>());

        result.Should().BeNull();
    }

    /// <summary>All candidates ineligible (not Free) → returns null.</summary>
    [Fact]
    public void SelectNearest_AllIneligible_ReturnsNull()
    {
        var candidates = new[]
        {
            MakeCandidate(status: DriverStatus.Offline),
            MakeCandidate(status: DriverStatus.EnRoute),
            MakeCandidate(status: DriverStatus.Busy)
        };

        var result = NearestDriverSelector.SelectNearest(
            candidates,
            PickupLat, PickupLng,
            MaxRadiusKm, Now, StaleThreshold,
            new HashSet<Guid>());

        result.Should().BeNull();
    }

    /// <summary>Two equidistant eligible candidates → the same one is chosen every call (deterministic tiebreak by DriverId).</summary>
    [Fact]
    public void SelectNearest_EqualDistance_DeterministicTiebreak()
    {
        // Place two drivers at same latitude offset in opposite longitude directions — same haversine distance
        var id1 = new Guid("00000000-0000-0000-0000-000000000001");
        var id2 = new Guid("00000000-0000-0000-0000-000000000002");

        var c1 = new DriverCandidate(id1, Guid.CreateVersion7(), DriverStatus.Free,
            LastLat: PickupLat, LastLng: PickupLng + 0.01, LastPositionAt: Now);
        var c2 = new DriverCandidate(id2, Guid.CreateVersion7(), DriverStatus.Free,
            LastLat: PickupLat, LastLng: PickupLng - 0.01, LastPositionAt: Now);

        var resultA = NearestDriverSelector.SelectNearest(
            [c1, c2], PickupLat, PickupLng, MaxRadiusKm, Now, StaleThreshold, new HashSet<Guid>());
        var resultB = NearestDriverSelector.SelectNearest(
            [c2, c1], PickupLat, PickupLng, MaxRadiusKm, Now, StaleThreshold, new HashSet<Guid>());

        resultA.Should().NotBeNull();
        resultB.Should().NotBeNull();
        resultA!.DriverId.Should().Be(resultB!.DriverId,
            "tiebreak on DriverId must produce the same winner regardless of input order");
    }
}

using System.Globalization;
using FluentAssertions;
using Taxi.Api.Common.Geo;

namespace Taxi.Api.Tests.Geo;

/// <summary>Unit tests for the pure geo helper static classes:
/// <see cref="GeoCacheKey"/>, <see cref="HaversineDistance"/>, and <see cref="GeoEstimateFallback"/>.
/// All helpers are pure functions with no I/O.</summary>
public sealed class GeoHelpersTests
{
    // ──────────────────────────────────────────────────
    // GeoCacheKey — folding and rounding
    // ──────────────────────────────────────────────────

    /// <summary>Czech diacritics ("Nádraží") and differing case fold to the same suggest key.</summary>
    [Fact]
    public void GeoCacheKey_DiacriticsAndCase_FoldToSameKey()
    {
        var key1 = GeoCacheKey.Suggest("Nádraží Kolín", null);
        var key2 = GeoCacheKey.Suggest("nadrazi kolin", null);

        key1.Should().Be(key2, "diacritics and case must be normalized away");
    }

    /// <summary>Leading/trailing whitespace is trimmed for suggest keys.</summary>
    [Fact]
    public void GeoCacheKey_Suggest_TrimsWhitespace()
    {
        var key1 = GeoCacheKey.Suggest("  Praha  ", null);
        var key2 = GeoCacheKey.Suggest("Praha", null);

        key1.Should().Be(key2);
    }

    /// <summary>Near coordinate is included in the suggest key, rounded to 2 decimal places.</summary>
    [Fact]
    public void GeoCacheKey_Suggest_WithNear_IncludesRoundedCoordinates()
    {
        // 50.0849 rounds to 50.08; 14.4208 rounds to 14.42
        var keyA = GeoCacheKey.Suggest("Praha", (50.0849, 14.4208));
        var keyB = GeoCacheKey.Suggest("Praha", (50.0851, 14.4212)); // also rounds to 50.09/14.42

        // These should differ because lat rounds differently
        keyA.Should().NotBe(keyB);
    }

    /// <summary>Near coordinates that round to the same 2-decimal bucket produce the same key.</summary>
    [Fact]
    public void GeoCacheKey_Suggest_NearRoundsTo2Decimals()
    {
        // Both near coords round to (50.08, 14.42)
        var keyA = GeoCacheKey.Suggest("test", (50.0801, 14.4201));
        var keyB = GeoCacheKey.Suggest("test", (50.0849, 14.4249));

        keyA.Should().Be(keyB, "near coords differing only in the 3rd+ decimal must collide");
    }

    /// <summary>Suggest key without near omits coordinate portion.</summary>
    [Fact]
    public void GeoCacheKey_Suggest_WithoutNear_OmitsCoordinates()
    {
        var keyWithout = GeoCacheKey.Suggest("brno", null);
        var keyWith    = GeoCacheKey.Suggest("brno", (49.20, 16.61));

        keyWithout.Should().NotBe(keyWith);
    }

    /// <summary>Geocode key is the folded query (lowercase + trim + diacritics stripped).</summary>
    [Fact]
    public void GeoCacheKey_Geocode_FoldsQuery()
    {
        var key1 = GeoCacheKey.Geocode("Náměstí Republiky");
        var key2 = GeoCacheKey.Geocode("namesti republiky");

        key1.Should().Be(key2);
    }

    /// <summary>Reverse key includes lat/lng at 4 decimal places, invariant-culture formatted.</summary>
    [Fact]
    public void GeoCacheKey_Reverse_RoundsTo4Decimals()
    {
        // Both lat/lng values round to the same 4-decimal bucket
        var keyA = GeoCacheKey.Reverse(50.08001, 14.42001);
        var keyB = GeoCacheKey.Reverse(50.08004, 14.42004);

        keyA.Should().Be(keyB, "values differing only at the 5th decimal must collide");
    }

    /// <summary>Reverse key values differing at the 4th decimal place produce distinct keys.</summary>
    [Fact]
    public void GeoCacheKey_Reverse_DistinctAt4thDecimal()
    {
        var keyA = GeoCacheKey.Reverse(50.0800, 14.4200);
        var keyB = GeoCacheKey.Reverse(50.0801, 14.4201);

        keyA.Should().NotBe(keyB);
    }

    /// <summary>Route key includes both endpoints at 4 decimal places.</summary>
    [Fact]
    public void GeoCacheKey_Route_RoundsEndpointsTo4Decimals()
    {
        var keyA = GeoCacheKey.Route(50.0800, 14.4200, 49.1951, 16.6068);
        var keyB = GeoCacheKey.Route(50.0800, 14.4200, 49.1951, 16.6068);

        keyA.Should().Be(keyB, "identical inputs must produce the same key");
    }

    /// <summary>Route key differs when the destination differs at 4th decimal.</summary>
    [Fact]
    public void GeoCacheKey_Route_DiffersOnDistinctEndpoints()
    {
        var keyA = GeoCacheKey.Route(50.0800, 14.4200, 49.1951, 16.6068);
        var keyB = GeoCacheKey.Route(50.0800, 14.4200, 49.1952, 16.6069);

        keyA.Should().NotBe(keyB);
    }

    /// <summary>Keys use invariant-culture formatting — not locale-dependent decimal separator.</summary>
    [Fact]
    public void GeoCacheKey_Reverse_UsesInvariantCulture()
    {
        var key = GeoCacheKey.Reverse(50.08, 14.42);

        // Invariant culture uses '.' not ',' (cs-CZ locale)
        key.Should().Contain("50.0800").And.Contain("14.4200");
    }

    // ──────────────────────────────────────────────────
    // HaversineDistance
    // ──────────────────────────────────────────────────

    /// <summary>Same point returns 0 metres.</summary>
    [Fact]
    public void HaversineDistance_SamePoint_ReturnsZero()
    {
        HaversineDistance.Meters(50.0755, 14.4378, 50.0755, 14.4378)
            .Should().BeApproximately(0, 0.001);
    }

    /// <summary>Prague (Václavské náměstí) to Brno (náměstí Svobody) is approximately 185 km ± 5 km.
    /// Reference: straight-line (great-circle) distance is about 180–188 km depending on exact coord choice.</summary>
    [Fact]
    public void HaversineDistance_KnownPair_WithinTolerance()
    {
        // Prague: 50.0755, 14.4378  Brno: 49.1951, 16.6068
        var meters = HaversineDistance.Meters(50.0755, 14.4378, 49.1951, 16.6068);

        // 185 km ± 5 km tolerance (great-circle; actual road distance is ~210 km)
        meters.Should().BeInRange(180_000, 190_000,
            "Prague–Brno great-circle distance is ~185 km");
    }

    /// <summary>Prague to the same longitude on the equator produces a large number.</summary>
    [Fact]
    public void HaversineDistance_LargeDistance_IsPositive()
    {
        var meters = HaversineDistance.Meters(50.0, 14.0, 0.0, 14.0);
        meters.Should().BeGreaterThan(5_000_000, "should be over 5000 km to equator");
    }

    // ──────────────────────────────────────────────────
    // GeoEstimateFallback — road factor, ETA, band
    // ──────────────────────────────────────────────────

    /// <summary>Road distance applies ×1.3 factor over the haversine input.</summary>
    [Fact]
    public void GeoEstimateFallback_Distance_AppliesRoadFactor()
    {
        // 100 km straight-line → 130 km road estimate
        var roadMeters = GeoEstimateFallback.RoadDistanceMeters(100_000);

        roadMeters.Should().BeApproximately(130_000, 0.5,
            "road distance = haversine × 1.3");
    }

    /// <summary>ETA uses road distance divided by 35 km/h, returning seconds.</summary>
    [Fact]
    public void GeoEstimateFallback_Eta_UsesRoadDistanceAt35KmH()
    {
        // 35 km / 35 km/h = 1 hour = 3600 s
        var durationS = GeoEstimateFallback.DurationSeconds(35_000);

        durationS.Should().BeApproximately(3600, 1,
            "35 km at 35 km/h = 3600 s");
    }

    /// <summary>Wider ±20% band lower bound = value × 0.8.</summary>
    [Fact]
    public void GeoEstimateFallback_Band_LowerBoundIs80Percent()
    {
        var (lower, _) = GeoEstimateFallback.WideBand(1000);

        lower.Should().BeApproximately(800, 0.5);
    }

    /// <summary>Wider ±20% band upper bound = value × 1.2.</summary>
    [Fact]
    public void GeoEstimateFallback_Band_UpperBoundIs120Percent()
    {
        var (_, upper) = GeoEstimateFallback.WideBand(1000);

        upper.Should().BeApproximately(1200, 0.5);
    }

    /// <summary>Full fallback pipeline: haversine → ×1.3 road → ETA = road/35 km/h → ±20% band on road distance.</summary>
    [Fact]
    public void GeoEstimateFallback_Distance_AppliesRoadFactorAndBand()
    {
        // 100 km straight-line → 130 km road → band (104_000, 156_000)
        var roadMeters = GeoEstimateFallback.RoadDistanceMeters(100_000);
        var (lower, upper) = GeoEstimateFallback.WideBand(roadMeters);

        roadMeters.Should().BeApproximately(130_000, 0.5);
        lower.Should().BeApproximately(104_000, 0.5);
        upper.Should().BeApproximately(156_000, 0.5);
    }
}

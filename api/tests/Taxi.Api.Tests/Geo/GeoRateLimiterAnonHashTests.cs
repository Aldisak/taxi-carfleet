using FluentAssertions;
using Taxi.Api.Common.Geo;

namespace Taxi.Api.Tests.Geo;

/// <summary>Unit tests for the anonymous bucket ID hash in <see cref="GeoRateLimiter"/>.
/// Required per UC-014 WI-1 test case F4: the hash must be stable across calls and must never
/// collide with UUIDv7 user identifiers.</summary>
public sealed class GeoRateLimiterAnonHashTests
{
    /// <summary>The same input key always produces the same Guid (stable bucket mapping).
    /// Without stability, a new bucket is minted on every anonymous request, making throttling impossible.</summary>
    [Fact]
    public void DeriveAnonBucketId_SameKey_ReturnsSameGuidEveryTime()
    {
        const string key = "anon:127.0.0.1";

        var first = GeoRateLimiter.DeriveAnonBucketId(key);
        var second = GeoRateLimiter.DeriveAnonBucketId(key);
        var third = GeoRateLimiter.DeriveAnonBucketId(key);

        first.Should().Be(second, "same key must always produce the same bucket ID");
        second.Should().Be(third, "same key must always produce the same bucket ID");
    }

    /// <summary>Different input keys produce different Guids (no trivial collision).</summary>
    [Fact]
    public void DeriveAnonBucketId_DifferentKeys_ReturnDifferentGuids()
    {
        var id1 = GeoRateLimiter.DeriveAnonBucketId("anon:127.0.0.1");
        var id2 = GeoRateLimiter.DeriveAnonBucketId("anon:192.168.1.1");
        var id3 = GeoRateLimiter.DeriveAnonBucketId("anon:10.0.0.1|demo");

        id1.Should().NotBe(id2, "different IPs must map to different buckets");
        id1.Should().NotBe(id3, "different IPs+slugs must map to different buckets");
        id2.Should().NotBe(id3);
    }

    /// <summary>The version character in the derived Guid's string form is '5' (not '7'), so it structurally cannot
    /// match a UUIDv7 user identifier from <c>Guid.CreateVersion7()</c>.
    /// UUID string format: xxxxxxxx-xxxx-Vxxx-xxxx-xxxxxxxxxxxx where V is the version digit.</summary>
    [Theory]
    [InlineData("anon:127.0.0.1")]
    [InlineData("anon:192.168.0.100|demo")]
    [InlineData("anon:noip|anon")]
    public void DeriveAnonBucketId_VersionChar_IsAlwaysFive(string key)
    {
        var id = GeoRateLimiter.DeriveAnonBucketId(key);
        // UUID string format: xxxxxxxx-xxxx-Vxxx-xxxx-xxxxxxxxxxxx
        // Third group (index 2 when split by '-') starts with the version character.
        var versionChar = id.ToString().Split('-')[2][0];
        versionChar.Should().Be('5', "version nibble must be 5 to prevent collision with UUIDv7 (version 7)");
    }

    /// <summary>A derived anon Guid cannot equal any realistic UUIDv7 because their version nibbles differ.</summary>
    [Fact]
    public void DeriveAnonBucketId_NeverEqualsUuidV7()
    {
        // Generate many UUIDv7s and confirm none match the fixed anon hash.
        var anonId = GeoRateLimiter.DeriveAnonBucketId("anon:127.0.0.1");

        for (var i = 0; i < 100; i++)
        {
            var v7 = Guid.CreateVersion7();
            v7.Should().NotBe(anonId, "a freshly minted UUIDv7 must never equal the deterministic anon bucket ID");
        }
    }
}

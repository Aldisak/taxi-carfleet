using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;

namespace Taxi.Api.Common.Geo;

/// <summary>Per-user (or per-anonymous-key) token-bucket rate limiter for geo proxy endpoints.
/// Allows 5 requests per second per bucket. Registered as a singleton.
/// Uses the injected <see cref="TimeProvider"/> so tests can control time deterministically.
/// <para>
/// For authenticated requests the bucket is keyed by the JWT <c>sub</c> Guid.
/// For anonymous requests the bucket is keyed by a stable deterministic Guid derived from
/// a string identifier (e.g. <c>ip|slug</c>) via <see cref="DeriveAnonBucketId"/>.
/// The derived Guid has its version nibble set to <c>0x5</c> (name-based) so it can never
/// collide with UUIDv7 user identifiers from <c>Guid.CreateVersion7()</c>.
/// </para></summary>
public sealed class GeoRateLimiter(TimeProvider timeProvider)
{
    private const int MaxTokens = 5;
    private const double RefillRatePerSecond = 5.0;

    private readonly ConcurrentDictionary<Guid, Bucket> _buckets = new();

    /// <summary>Attempts to acquire one request token for the given authenticated user.
    /// Returns <see langword="true"/> when the request is within the rate limit,
    /// <see langword="false"/> when the bucket is exhausted (caller should return 429).</summary>
    /// <param name="userId">The authenticated user's identifier (from the JWT sub claim).</param>
    public bool TryAcquire(Guid userId) => TryAcquireCore(userId);

    /// <summary>Attempts to acquire one request token keyed on an anonymous string identifier.
    /// The string is hashed to a stable Guid via <see cref="DeriveAnonBucketId"/> so the same
    /// key always maps to the same bucket and is never unlimited.
    /// Returns <see langword="true"/> when the request is within the rate limit,
    /// <see langword="false"/> when the bucket is exhausted (caller should return 429).</summary>
    /// <param name="key">A string identifier such as <c>"anon:127.0.0.1|demo"</c>.</param>
    public bool TryAcquire(string key) => TryAcquireCore(DeriveAnonBucketId(key));

    /// <summary>Derives a stable, version-5-style Guid from an anonymous string key.
    /// The Guid is built from SHA-256 hash bytes with the version nibble forced to 5
    /// (third group, first hex character in the UUID string), so the result can never match
    /// a UUIDv7 user id (whose version character is '7').</summary>
    /// <param name="key">The anonymous string key to hash (e.g. <c>"anon:127.0.0.1"</c>).</param>
    /// <returns>A stable Guid that is deterministic for the same input across calls.</returns>
    internal static Guid DeriveAnonBucketId(string key)
    {
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes("anon-geo-rl:" + key));
        // Build the UUID hex string from the first 16 bytes of the SHA-256 hash.
        // Format: xxxxxxxx-xxxx-5xxx-8xxx-xxxxxxxxxxxx
        // Byte groups: [0..3]-[4..5]-[6..7]-[8..9]-[10..15]
        // Force version digit = 5 in the third group's first nibble (high nibble of byte 6).
        // Force variant bits = 10xx in byte 8 (RFC 4122 variant).
        Span<byte> b = hash[..16];
        // RFC 4122 version in third group (bytes 6..7): high nibble of byte 6 = version.
        b[6] = (byte)((b[6] & 0x0F) | 0x50);
        // RFC 4122 variant in fourth group (bytes 8..9): high bits of byte 8 = 10xx.
        b[8] = (byte)((b[8] & 0x3F) | 0x80);
        // Use the 16-byte big-endian UUID constructor to preserve the byte layout as RFC 4122.
        var uuidStr = $"{b[0]:x2}{b[1]:x2}{b[2]:x2}{b[3]:x2}-" +
                      $"{b[4]:x2}{b[5]:x2}-" +
                      $"{b[6]:x2}{b[7]:x2}-" +
                      $"{b[8]:x2}{b[9]:x2}-" +
                      $"{b[10]:x2}{b[11]:x2}{b[12]:x2}{b[13]:x2}{b[14]:x2}{b[15]:x2}";
        return Guid.Parse(uuidStr);
    }

    /// <summary>Resets all rate-limit buckets. Call in tests before each test to prevent contamination.</summary>
    public void Reset() => _buckets.Clear();

    private bool TryAcquireCore(Guid bucketId)
    {
        var now = timeProvider.GetUtcNow().ToUnixTimeMilliseconds() / 1000.0;
        var bucket = _buckets.GetOrAdd(bucketId, _ => new Bucket(now, MaxTokens));

        lock (bucket)
        {
            var elapsed = now - bucket.LastRefillTime;
            var refilled = Math.Min(MaxTokens, bucket.Tokens + elapsed * RefillRatePerSecond);
            bucket.LastRefillTime = now;
            bucket.Tokens = refilled;

            if (bucket.Tokens < 1.0)
                return false;

            bucket.Tokens -= 1.0;
            return true;
        }
    }

    private sealed class Bucket(double lastRefillTime, double tokens)
    {
        /// <summary>Time of the last refill in fractional seconds since Unix epoch.</summary>
        public double LastRefillTime { get; set; } = lastRefillTime;

        /// <summary>Current available tokens in the bucket.</summary>
        public double Tokens { get; set; } = tokens;
    }
}

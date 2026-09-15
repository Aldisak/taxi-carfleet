using System.Collections.Concurrent;

namespace Taxi.Api.Common.Geo;

/// <summary>Per-authenticated-user token-bucket rate limiter for geo proxy endpoints.
/// Allows 5 requests per second per user ID. Registered as a singleton.
/// Uses the injected <see cref="TimeProvider"/> so tests can control time deterministically.</summary>
public sealed class GeoRateLimiter(TimeProvider timeProvider)
{
    private const int MaxTokens = 5;
    private const double RefillRatePerSecond = 5.0;

    private readonly ConcurrentDictionary<Guid, Bucket> _buckets = new();

    /// <summary>Attempts to acquire one request token for the given user.
    /// Returns <see langword="true"/> when the request is within the rate limit,
    /// <see langword="false"/> when the bucket is exhausted (caller should return 429).</summary>
    /// <param name="userId">The authenticated user's identifier (from the JWT sub claim).</param>
    public bool TryAcquire(Guid userId)
    {
        var now = timeProvider.GetUtcNow().ToUnixTimeMilliseconds() / 1000.0;
        var bucket = _buckets.GetOrAdd(userId, _ => new Bucket(now, MaxTokens));

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

    /// <summary>Resets all rate-limit buckets. Call in tests before each test to prevent contamination.</summary>
    public void Reset() => _buckets.Clear();

    private sealed class Bucket(double lastRefillTime, double tokens)
    {
        /// <summary>Time of the last refill in fractional seconds since Unix epoch.</summary>
        public double LastRefillTime { get; set; } = lastRefillTime;

        /// <summary>Current available tokens in the bucket.</summary>
        public double Tokens { get; set; } = tokens;
    }
}

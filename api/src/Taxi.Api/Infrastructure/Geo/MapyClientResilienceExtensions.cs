using Polly;
using Polly.CircuitBreaker;
using Polly.Retry;
using Polly.Timeout;

namespace Taxi.Api.Infrastructure.Geo;

/// <summary>Extension methods that attach the Mapy.com resilience pipeline to an <see cref="IHttpClientBuilder"/>.
/// Extracted so both production GeoFeatureConfiguration and the handler-level unit tests
/// use the same pipeline settings.</summary>
internal static class MapyClientResilienceExtensions
{
    /// <summary>Adds the shared Mapy resilience pipeline:
    /// <list type="bullet">
    ///   <item>4-second per-attempt timeout (innermost)</item>
    ///   <item>1 retry on 5xx (middle)</item>
    ///   <item>Circuit breaker: opens when ≥5 calls fail with ≥50% failure rate in a 30s window, stays open 30s (outermost)</item>
    /// </list>
    /// When the circuit breaker opens, <see cref="BrokenCircuitException"/> is thrown and caught inside
    /// <see cref="MapyClient"/>, mapping to <see cref="GeoResult{T}.Unavailable"/> with
    /// <see cref="GeoUnavailableReason.CircuitOpen"/> — no upstream call is made and no credit is spent.</summary>
    internal static IHttpClientBuilder AddMapyResilienceHandler(this IHttpClientBuilder builder)
    {
        builder.AddResilienceHandler("mapy", pipeline =>
        {
            // Layer 1 (innermost): per-attempt timeout
            pipeline.AddTimeout(new TimeoutStrategyOptions
            {
                Timeout = TimeSpan.FromSeconds(4)
            });

            // Layer 2: retry once on 5xx transient responses
            pipeline.AddRetry(new RetryStrategyOptions<HttpResponseMessage>
            {
                MaxRetryAttempts = 1,
                Delay = TimeSpan.Zero,
                UseJitter = false,
                ShouldHandle = static args =>
                {
                    if (args.Outcome.Result is { } resp)
                        return ValueTask.FromResult((int)resp.StatusCode >= 500);
                    return ValueTask.FromResult(false);
                }
            });

            // Layer 3 (outermost): circuit breaker
            // MinimumThroughput is 5 so tests can open it within a bounded call count.
            // Production: opens after ≥50% failure rate over ≥5 calls in 30s window; stays open 30s.
            pipeline.AddCircuitBreaker(new CircuitBreakerStrategyOptions<HttpResponseMessage>
            {
                FailureRatio = 0.5,
                MinimumThroughput = 5,
                SamplingDuration = TimeSpan.FromSeconds(30),
                BreakDuration = TimeSpan.FromSeconds(30),
                ShouldHandle = static args =>
                {
                    if (args.Outcome.Result is { } resp)
                        return ValueTask.FromResult((int)resp.StatusCode >= 500);
                    if (args.Outcome.Exception is not null and not BrokenCircuitException)
                        return ValueTask.FromResult(true);
                    return ValueTask.FromResult(false);
                }
            });
        });
        return builder;
    }
}

namespace Taxi.Api.Infrastructure.Geo;

/// <summary>Reason the geo upstream was unavailable.</summary>
public enum GeoUnavailableReason
{
    /// <summary>The request timed out before the upstream responded.</summary>
    Timeout,

    /// <summary>The upstream returned a 5xx error after all retries were exhausted.</summary>
    ServerError,

    /// <summary>The circuit breaker is open — no upstream call was made.</summary>
    CircuitOpen
}

/// <summary>Discriminated result union for Mapy.com API calls.
/// Either <see cref="GeoResult{T}.Success"/> (contains a value) or
/// <see cref="GeoResult{T}.Unavailable"/> (contains a reason); never null, never throws for degradation.</summary>
public abstract record GeoResult<T>
{
    /// <summary>Successful result carrying the parsed upstream value.</summary>
    /// <param name="Value">The parsed response value.</param>
    public sealed record Success(T Value) : GeoResult<T>;

    /// <summary>Upstream was unavailable; no credit was spent when <see cref="Reason"/> is <see cref="GeoUnavailableReason.CircuitOpen"/>.</summary>
    /// <param name="Reason">Why the upstream was unavailable.</param>
    public sealed record Unavailable(GeoUnavailableReason Reason) : GeoResult<T>;
}

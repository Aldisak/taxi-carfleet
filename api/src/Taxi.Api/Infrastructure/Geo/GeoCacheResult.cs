namespace Taxi.Api.Infrastructure.Geo;

/// <summary>Return value from <see cref="GeoCache.GetOrAddAsync{T}"/>.
/// Carries the underlying <see cref="GeoResult{T}"/> together with a cache-hit signal
/// so callers can set the <c>X-Geo-Cache: hit|miss</c> debug header.</summary>
/// <typeparam name="T">The typed payload of a successful geo result.</typeparam>
/// <param name="Result">The geo-provider result (Success or Unavailable).</param>
/// <param name="WasHit">True when the value was served from L1 or L2 cache; false on a genuine upstream call.</param>
public record GeoCacheResult<T>(GeoResult<T> Result, bool WasHit);

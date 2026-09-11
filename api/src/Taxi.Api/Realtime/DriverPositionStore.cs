using System.Collections.Concurrent;

namespace Taxi.Api.Realtime;

/// <summary>Singleton in-memory store for driver position state.
/// Implements server-side throttling (max 1 update per 3 s per driver) and tracks
/// when the DB flush is due (every 30 s per driver).</summary>
internal sealed class DriverPositionStore(TimeProvider timeProvider)
{
    private static readonly TimeSpan ThrottleWindow = TimeSpan.FromSeconds(3);
    private static readonly TimeSpan FlushInterval = TimeSpan.FromSeconds(30);

    private sealed class DriverState
    {
        /// <summary>Last latitude accepted (after throttle).</summary>
        public double Lat { get; set; }

        /// <summary>Last longitude accepted (after throttle).</summary>
        public double Lng { get; set; }

        /// <summary>Last heading in degrees. Null if unknown.</summary>
        public double? Heading { get; set; }

        /// <summary>Last speed in km/h. Null if unknown.</summary>
        public double? Speed { get; set; }

        /// <summary>UTC timestamp of the last accepted update.</summary>
        public DateTimeOffset LastAccepted { get; set; } = DateTimeOffset.MinValue;

        /// <summary>UTC timestamp of the last DB flush. MinValue means flush is due on first update.</summary>
        public DateTimeOffset LastDbFlush { get; set; } = DateTimeOffset.MinValue;
    }

    private readonly ConcurrentDictionary<Guid, DriverState> _states = new();

    /// <summary>Attempts to record an incoming position update for the driver.
    /// Returns whether the update was accepted (not throttled) and whether a DB flush is due.</summary>
    /// <param name="driverId">The driver's identifier.</param>
    /// <param name="lat">Latitude.</param>
    /// <param name="lng">Longitude.</param>
    /// <param name="heading">Heading in degrees. Null if unknown.</param>
    /// <param name="speed">Speed in km/h. Null if unknown.</param>
    /// <returns>
    /// <c>accepted = true</c> when the throttle window has elapsed (or first update ever);
    /// <c>flushDue = true</c> when the 30 s DB-write interval has elapsed.
    /// Both are false when the update is throttled.
    /// </returns>
    public (bool Accepted, bool FlushDue) TryUpdate(
        Guid driverId,
        double lat,
        double lng,
        double? heading,
        double? speed)
    {
        var now = timeProvider.GetUtcNow();

        var state = _states.GetOrAdd(driverId, _ => new DriverState());

        lock (state)
        {
            if (now - state.LastAccepted < ThrottleWindow)
                return (false, false);

            state.Lat = lat;
            state.Lng = lng;
            state.Heading = heading;
            state.Speed = speed;
            state.LastAccepted = now;

            // Flush is due on first update (LastDbFlush == MinValue) OR after the flush interval.
            var flushDue = state.LastDbFlush == DateTimeOffset.MinValue ||
                           now - state.LastDbFlush >= FlushInterval;

            if (flushDue)
                state.LastDbFlush = now;

            return (true, flushDue);
        }
    }

    /// <summary>Removes state for a driver (called on disconnect).</summary>
    /// <param name="driverId">The driver identifier.</param>
    public void Remove(Guid driverId) => _states.TryRemove(driverId, out _);
}

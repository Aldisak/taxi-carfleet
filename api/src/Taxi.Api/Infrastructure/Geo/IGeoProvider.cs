namespace Taxi.Api.Infrastructure.Geo;

/// <summary>Abstraction over geo upstream services (Photon for suggest, OSRM for route).
/// Injected into endpoints — tests replace with a fake to avoid real HTTP calls.</summary>
public interface IGeoProvider
{
    /// <summary>Returns address suggestions for the given query string.</summary>
    /// <param name="query">The user-entered search text.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>A list of address suggestions (may be empty).</returns>
    Task<IReadOnlyList<GeoSuggestItem>> SuggestAsync(string query, CancellationToken ct);

    /// <summary>Returns the route distance and duration between two coordinates.</summary>
    /// <param name="fromLat">Origin latitude.</param>
    /// <param name="fromLng">Origin longitude.</param>
    /// <param name="toLat">Destination latitude.</param>
    /// <param name="toLng">Destination longitude.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>Distance in metres and duration in seconds.</returns>
    Task<GeoRouteResult> RouteAsync(double fromLat, double fromLng, double toLat, double toLng, CancellationToken ct);
}

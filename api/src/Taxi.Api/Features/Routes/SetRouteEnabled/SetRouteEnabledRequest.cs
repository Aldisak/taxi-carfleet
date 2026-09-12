namespace Taxi.Api.Features.Routes.SetRouteEnabled;

/// <summary>Request body for PATCH /routes/{id}/enable. The id is bound from the route.</summary>
public sealed class SetRouteEnabledRequest
{
    /// <summary>The route id (from the route).</summary>
    public Guid Id { get; init; }

    /// <summary>Whether the route should be enabled.</summary>
    public bool IsEnabled { get; init; }
}

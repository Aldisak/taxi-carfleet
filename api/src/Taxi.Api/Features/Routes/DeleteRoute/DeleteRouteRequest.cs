namespace Taxi.Api.Features.Routes.DeleteRoute;

/// <summary>Request for soft-deleting a route.</summary>
public sealed record DeleteRouteRequest
{
    /// <summary>The route's unique identifier.</summary>
    public Guid Id { get; init; }
}

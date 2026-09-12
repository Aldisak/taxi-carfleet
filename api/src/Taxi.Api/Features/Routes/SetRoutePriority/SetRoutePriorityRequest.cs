namespace Taxi.Api.Features.Routes.SetRoutePriority;

/// <summary>Request body for PATCH /routes/{id}/priority. The id is bound from the route.</summary>
public sealed class SetRoutePriorityRequest
{
    /// <summary>The route id (from the route).</summary>
    public Guid Id { get; init; }

    /// <summary>The new priority (higher wins in matching).</summary>
    public int Priority { get; init; }
}

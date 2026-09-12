namespace Taxi.Api.Features.Routes.CreateRoute;

/// <summary>Response for POST /routes — the created route's id.</summary>
/// <param name="Id">The created route's id.</param>
public record CreateRouteResponse(Guid Id);

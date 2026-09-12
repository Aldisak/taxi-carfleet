namespace Taxi.Api.Features.Routes.ListRoutes;

/// <summary>Response for GET /routes — non-deleted routes ordered by priority descending.</summary>
/// <param name="Routes">The routes.</param>
public record ListRoutesResponse(IReadOnlyList<RouteAdminDto> Routes);

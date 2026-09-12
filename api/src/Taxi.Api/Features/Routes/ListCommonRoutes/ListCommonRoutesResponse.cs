namespace Taxi.Api.Features.Routes.ListCommonRoutes;

/// <summary>Response for GET /routes/common — the list of common-route cards.</summary>
/// <param name="Routes">The valid-now, enabled common routes ordered by priority descending.</param>
public record ListCommonRoutesResponse(IReadOnlyList<CommonRouteDto> Routes);

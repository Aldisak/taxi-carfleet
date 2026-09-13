namespace Taxi.Api.Features.Reports.GetFleetReport;

/// <summary>A common route ranked by how many orders used it in range.</summary>
/// <param name="RouteId">The route identifier.</param>
/// <param name="Name">The route's display name.</param>
/// <param name="Count">Number of orders priced by this route in range.</param>
public record TopRouteDto(Guid RouteId, string Name, int Count);

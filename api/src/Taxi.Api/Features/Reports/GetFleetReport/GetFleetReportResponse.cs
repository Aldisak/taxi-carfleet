namespace Taxi.Api.Features.Reports.GetFleetReport;

/// <summary>Fleet report payload: headline KPIs, a rides-per-Prague-day series, and top routes by count.</summary>
/// <param name="Kpis">Headline KPIs for the range.</param>
/// <param name="RidesPerDay">Rides-per-Prague-day series, ascending by date.</param>
/// <param name="TopRoutes">Top common routes by order count, descending.</param>
public record GetFleetReportResponse(
    FleetKpiDto Kpis,
    IReadOnlyList<RidesPerDayDto> RidesPerDay,
    IReadOnlyList<TopRouteDto> TopRoutes);

namespace Taxi.Api.Features.Reports.GetDriverReport;

/// <summary>Driver report payload: per-Prague-day rows, a totals row, and the driver's average rating.</summary>
/// <param name="DriverId">The driver this report covers.</param>
/// <param name="DriverName">The driver's display name.</param>
/// <param name="AvgRating">Average customer rating over completed+rated orders in range; null when none rated.</param>
/// <param name="Days">Per-day aggregated rows, ascending by date.</param>
/// <param name="Totals">The summed totals row across the whole range.</param>
public record GetDriverReportResponse(
    Guid DriverId,
    string DriverName,
    double? AvgRating,
    IReadOnlyList<DriverReportDayDto> Days,
    DriverReportDayDto Totals);

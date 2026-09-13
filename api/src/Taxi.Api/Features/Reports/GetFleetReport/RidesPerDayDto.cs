namespace Taxi.Api.Features.Reports.GetFleetReport;

/// <summary>One point of the rides-per-Prague-day series (for the dispatcher SVG bar chart).</summary>
/// <param name="Date">The Prague calendar day as <c>yyyy-MM-dd</c>.</param>
/// <param name="Count">Number of orders created on that day.</param>
public record RidesPerDayDto(string Date, int Count);

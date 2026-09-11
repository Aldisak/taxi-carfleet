namespace Taxi.Api.Features.Drivers.ListDrivers;

/// <summary>Response for the list drivers endpoint.</summary>
public record ListDriversResponse(IReadOnlyList<DriverSummaryDto> Items);

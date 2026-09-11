namespace Taxi.Api.Features.Drivers.ListDrivers;

/// <summary>Summary of a driver for the list view.</summary>
public record DriverSummaryDto(
    Guid DriverId,
    string DisplayName,
    string Status,
    string? CurrentVehiclePlate,
    DateTimeOffset? LastPositionAt);

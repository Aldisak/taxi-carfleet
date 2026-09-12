namespace Taxi.Api.Features.Drivers.ListDrivers;

/// <summary>Summary of a driver for the list view. Includes last known position (lastLat/lastLng) for map markers and distance sort.</summary>
public record DriverSummaryDto(
    Guid DriverId,
    string DisplayName,
    string Status,
    string? CurrentVehiclePlate,
    DateTimeOffset? LastPositionAt,
    double? LastLat,
    double? LastLng);

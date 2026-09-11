namespace Taxi.Api.Features.Drivers.GetMe;

/// <summary>Response DTO for a driver's own profile and current shift info.</summary>
public record GetMeResponse(
    Guid DriverId,
    string DisplayName,
    string Status,
    Guid? CurrentVehicleId,
    string? CurrentVehiclePlate,
    DateTimeOffset? LastPositionAt,
    Guid? CurrentShiftId,
    DateTimeOffset? CurrentShiftStartedAt);

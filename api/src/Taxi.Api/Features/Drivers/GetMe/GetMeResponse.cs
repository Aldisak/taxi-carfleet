namespace Taxi.Api.Features.Drivers.GetMe;

/// <summary>Response DTO for a driver's own profile and current shift info.
/// <para><b>ActiveOrderId</b>: the driver's non-terminal order id (Assigned/Accepted/Arrived/InProgress)
/// or null. Additive field added in A-me for the driver PWA to restore ride state after IndexedDB is wiped.</para>
/// </summary>
public record GetMeResponse(
    Guid DriverId,
    string DisplayName,
    string Status,
    Guid? CurrentVehicleId,
    string? CurrentVehiclePlate,
    DateTimeOffset? LastPositionAt,
    Guid? CurrentShiftId,
    DateTimeOffset? CurrentShiftStartedAt,
    Guid? ActiveOrderId = null);

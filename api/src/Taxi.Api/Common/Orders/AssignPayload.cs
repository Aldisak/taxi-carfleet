namespace Taxi.Api.Common.Orders;

/// <summary>Payload for the <see cref="OrderTransition.Assign"/> and <see cref="OrderTransition.Reassign"/>
/// transitions.</summary>
/// <param name="DriverId">The driver row ID to assign.</param>
/// <param name="VehicleId">The vehicle ID (from the driver's <c>CurrentVehicleId</c>). Null when the driver
/// has no current vehicle assigned (allowed — the order proceeds without a vehicle ID).</param>
public record AssignPayload(Guid DriverId, Guid? VehicleId);

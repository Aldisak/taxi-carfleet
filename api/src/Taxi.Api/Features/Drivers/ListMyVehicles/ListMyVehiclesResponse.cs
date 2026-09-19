namespace Taxi.Api.Features.Drivers.ListMyVehicles;

/// <summary>Response for <c>GET /drivers/me/vehicles</c>: the active vehicles in the driver's fleet.</summary>
/// <param name="Items">Active vehicles the driver may select when going online.</param>
public record ListMyVehiclesResponse(IReadOnlyList<DriverVehicleDto> Items);

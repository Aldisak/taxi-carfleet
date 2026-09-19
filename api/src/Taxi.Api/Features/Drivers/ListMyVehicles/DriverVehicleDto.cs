namespace Taxi.Api.Features.Drivers.ListMyVehicles;

/// <summary>A vehicle the calling driver may select when going online.</summary>
/// <param name="Id">Vehicle id.</param>
/// <param name="Plate">License plate.</param>
/// <param name="Make">Manufacturer.</param>
/// <param name="Model">Model name.</param>
public record DriverVehicleDto(Guid Id, string Plate, string Make, string Model);

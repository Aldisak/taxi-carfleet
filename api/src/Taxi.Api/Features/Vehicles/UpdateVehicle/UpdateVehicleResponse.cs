namespace Taxi.Api.Features.Vehicles.UpdateVehicle;

/// <summary>Response after updating a vehicle.</summary>
public record UpdateVehicleResponse(Guid Id, string Plate, string Make, string Model, string Color, int Seats, bool IsActive);

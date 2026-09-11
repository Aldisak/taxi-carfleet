namespace Taxi.Api.Features.Vehicles.CreateVehicle;

/// <summary>Response after creating a new vehicle.</summary>
public record CreateVehicleResponse(Guid Id, string Plate, string Make, string Model, string Color, int Seats, bool IsActive);

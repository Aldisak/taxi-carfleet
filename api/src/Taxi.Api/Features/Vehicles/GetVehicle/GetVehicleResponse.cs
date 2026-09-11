namespace Taxi.Api.Features.Vehicles.GetVehicle;

/// <summary>Response for a single vehicle detail.</summary>
public record GetVehicleResponse(Guid Id, string Plate, string Make, string Model, string Color, int Seats, bool IsActive);

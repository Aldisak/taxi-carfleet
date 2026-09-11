namespace Taxi.Api.Features.Vehicles.ListVehicles;

/// <summary>Response DTO for a single vehicle in the list.</summary>
public record VehicleDto(Guid Id, string Plate, string Make, string Model, string Color, int Seats, bool IsActive);

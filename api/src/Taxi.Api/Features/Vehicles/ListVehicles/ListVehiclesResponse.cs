namespace Taxi.Api.Features.Vehicles.ListVehicles;

/// <summary>Response for the list vehicles endpoint.</summary>
public record ListVehiclesResponse(IReadOnlyList<VehicleDto> Items);

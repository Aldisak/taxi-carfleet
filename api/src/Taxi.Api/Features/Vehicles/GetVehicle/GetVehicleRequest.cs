namespace Taxi.Api.Features.Vehicles.GetVehicle;

/// <summary>Request for retrieving a single vehicle by ID.</summary>
public record GetVehicleRequest
{
    /// <summary>The vehicle's unique identifier.</summary>
    public Guid Id { get; init; }
}

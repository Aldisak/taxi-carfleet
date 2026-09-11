namespace Taxi.Api.Features.Vehicles.DeleteVehicle;

/// <summary>Request for deleting (deactivating) a vehicle.</summary>
public record DeleteVehicleRequest
{
    /// <summary>The vehicle's unique identifier.</summary>
    public Guid Id { get; init; }
}

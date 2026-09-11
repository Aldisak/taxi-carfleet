namespace Taxi.Api.Features.Vehicles.CreateVehicle;

/// <summary>Request body for creating a new vehicle.</summary>
public record CreateVehicleRequest
{
    /// <summary>Vehicle registration plate. Must be unique within the fleet.</summary>
    public string Plate { get; init; } = string.Empty;

    /// <summary>Vehicle manufacturer / make.</summary>
    public string Make { get; init; } = string.Empty;

    /// <summary>Vehicle model name.</summary>
    public string Model { get; init; } = string.Empty;

    /// <summary>Vehicle color description.</summary>
    public string Color { get; init; } = string.Empty;

    /// <summary>Number of passenger seats. Must be at least 1.</summary>
    public int Seats { get; init; }
}

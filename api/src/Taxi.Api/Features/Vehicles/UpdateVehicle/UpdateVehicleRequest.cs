namespace Taxi.Api.Features.Vehicles.UpdateVehicle;

/// <summary>Request for updating a vehicle (full PUT update).</summary>
public record UpdateVehicleRequest
{
    /// <summary>Vehicle unique identifier (from route).</summary>
    public Guid Id { get; init; }

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

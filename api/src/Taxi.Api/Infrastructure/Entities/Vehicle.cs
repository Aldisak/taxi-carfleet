using Taxi.Api.Common.Tenancy;

namespace Taxi.Api.Infrastructure.Entities;

/// <summary>A fleet vehicle that can be assigned to a driver.</summary>
public class Vehicle : ITenantEntity
{
    /// <summary>Primary key (UUIDv7, app-generated).</summary>
    public Guid Id { get; set; }

    /// <summary>Fleet this vehicle belongs to.</summary>
    public Guid FleetId { get; set; }

    /// <summary>Vehicle registration plate.</summary>
    public required string Plate { get; set; }

    /// <summary>Vehicle manufacturer / make.</summary>
    public required string Make { get; set; }

    /// <summary>Vehicle model name.</summary>
    public required string Model { get; set; }

    /// <summary>Vehicle color description.</summary>
    public required string Color { get; set; }

    /// <summary>Number of passenger seats.</summary>
    public int Seats { get; set; }

    /// <summary>Whether the vehicle is currently active.</summary>
    public bool IsActive { get; set; }
}

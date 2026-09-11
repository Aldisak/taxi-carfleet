using Taxi.Api.Common.Tenancy;

namespace Taxi.Api.Infrastructure.Entities;

/// <summary>Driver profile linked 1:1 to a staff <see cref="User"/> with role Driver.</summary>
public class Driver : ITenantEntity
{
    /// <summary>Primary key (UUIDv7, app-generated).</summary>
    public Guid Id { get; set; }

    /// <summary>Fleet this driver belongs to.</summary>
    public Guid FleetId { get; set; }

    /// <summary>Linked user account (1:1).</summary>
    public Guid UserId { get; set; }

    /// <summary>Current operational status.</summary>
    public DriverStatus Status { get; set; }

    /// <summary>Vehicle currently assigned to this driver. Null when offline.</summary>
    public Guid? CurrentVehicleId { get; set; }

    /// <summary>Last known latitude from a position update. Null if never reported.</summary>
    public double? LastLat { get; set; }

    /// <summary>Last known longitude from a position update. Null if never reported.</summary>
    public double? LastLng { get; set; }

    /// <summary>UTC timestamp of the most recent position update. Null if never reported.</summary>
    public DateTimeOffset? LastPositionAt { get; set; }

    /// <summary>Whether the driver record is active.</summary>
    public bool IsActive { get; set; }
}

using Taxi.Api.Common.Tenancy;

namespace Taxi.Api.Infrastructure.Entities;

/// <summary>A work shift record created when a driver goes online and closed when they go offline.</summary>
public class DriverShift : ITenantEntity
{
    /// <summary>Primary key (UUIDv7, app-generated).</summary>
    public Guid Id { get; set; }

    /// <summary>Fleet this shift belongs to.</summary>
    public Guid FleetId { get; set; }

    /// <summary>Driver who started this shift.</summary>
    public Guid DriverId { get; set; }

    /// <summary>Vehicle the driver was using during this shift.</summary>
    public Guid VehicleId { get; set; }

    /// <summary>UTC timestamp when the shift started (driver went online).</summary>
    public DateTimeOffset StartedAt { get; set; }

    /// <summary>UTC timestamp when the shift ended (driver went offline). Null if the shift is still active.</summary>
    public DateTimeOffset? EndedAt { get; set; }
}

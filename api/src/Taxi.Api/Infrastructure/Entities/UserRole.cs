namespace Taxi.Api.Infrastructure.Entities;

/// <summary>Roles a <see cref="User"/> may have in the system.</summary>
public enum UserRole
{
    /// <summary>Customer who books rides via the app or phone.</summary>
    Customer,

    /// <summary>Driver of a fleet vehicle.</summary>
    Driver,

    /// <summary>Dispatcher who manages orders within a fleet.</summary>
    Dispatcher,

    /// <summary>Fleet administrator who manages fleet settings and staff.</summary>
    FleetAdmin,

    /// <summary>Super-administrator with cross-fleet access.</summary>
    SuperAdmin,

    /// <summary>Represents a system-initiated action (e.g. offer timeout). No human actor.</summary>
    System
}

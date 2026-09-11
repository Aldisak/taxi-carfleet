namespace Taxi.Api.Infrastructure.Entities;

/// <summary>Operational status of a <see cref="Driver"/>.</summary>
public enum DriverStatus
{
    /// <summary>Driver is not on shift.</summary>
    Offline,

    /// <summary>Driver is on shift and available to accept new orders.</summary>
    Free,

    /// <summary>Driver is heading to the pickup location.</summary>
    EnRoute,

    /// <summary>Driver has a customer in the vehicle.</summary>
    Busy
}

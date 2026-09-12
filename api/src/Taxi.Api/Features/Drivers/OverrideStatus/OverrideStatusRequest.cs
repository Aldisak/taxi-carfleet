using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Features.Drivers.OverrideStatus;

/// <summary>Request body for overriding a driver's status.</summary>
public class OverrideStatusRequest
{
    /// <summary>The target driver status. Must be Free, Busy, or Offline. EnRoute is not allowed.</summary>
    public DriverStatus Status { get; init; }
}

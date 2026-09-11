namespace Taxi.Api.Features.Drivers.GoOnline;

/// <summary>Request body for going online — driver associates themselves with a vehicle.</summary>
public record GoOnlineRequest
{
    /// <summary>The ID of the vehicle the driver will be using this shift.</summary>
    public Guid VehicleId { get; init; }
}

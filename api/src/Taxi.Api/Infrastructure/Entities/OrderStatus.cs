namespace Taxi.Api.Infrastructure.Entities;

/// <summary>Lifecycle status of an <see cref="Order"/>.</summary>
public enum OrderStatus
{
    /// <summary>Order has been created but not yet assigned to a driver.</summary>
    New,

    /// <summary>Order has been offered to a driver; awaiting acceptance.</summary>
    Assigned,

    /// <summary>Driver has accepted the order and is heading to pickup.</summary>
    Accepted,

    /// <summary>Driver has arrived at the pickup location.</summary>
    Arrived,

    /// <summary>Customer is in the vehicle; ride is underway.</summary>
    InProgress,

    /// <summary>Ride is complete; final price and payment recorded.</summary>
    Completed,

    /// <summary>Order was cancelled before completion.</summary>
    Cancelled
}

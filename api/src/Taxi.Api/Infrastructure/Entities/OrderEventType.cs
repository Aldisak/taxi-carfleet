namespace Taxi.Api.Infrastructure.Entities;

/// <summary>Type of event recorded in <see cref="OrderEvent"/>.</summary>
public enum OrderEventType
{
    /// <summary>Order was created.</summary>
    Created,

    /// <summary>Order was assigned to a driver.</summary>
    Assigned,

    /// <summary>Driver accepted the order.</summary>
    Accepted,

    /// <summary>Driver declined the order.</summary>
    Declined,

    /// <summary>Offer timed out and the order returned to New.</summary>
    Timeout,

    /// <summary>Driver arrived at the pickup location.</summary>
    Arrived,

    /// <summary>Ride started.</summary>
    Started,

    /// <summary>Ride was completed.</summary>
    Completed,

    /// <summary>Order was cancelled.</summary>
    Cancelled,

    /// <summary>Order was reassigned to a different driver.</summary>
    Reassigned,

    /// <summary>Final price was overridden from the fixed price.</summary>
    PriceOverridden,

    /// <summary>A dispatcher note was added to the order.</summary>
    NoteAdded,

    /// <summary>Order fields were partially updated by a dispatcher (PATCH /orders/{id}).</summary>
    Updated
}

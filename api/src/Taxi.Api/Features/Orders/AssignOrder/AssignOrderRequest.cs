namespace Taxi.Api.Features.Orders.AssignOrder;

/// <summary>Request body for POST /orders/{id}/assign.</summary>
public sealed class AssignOrderRequest
{
    /// <summary>Route-bound order ID.</summary>
    public Guid Id { get; set; }

    /// <summary>Driver row ID to assign to the order.</summary>
    public Guid DriverId { get; set; }
}

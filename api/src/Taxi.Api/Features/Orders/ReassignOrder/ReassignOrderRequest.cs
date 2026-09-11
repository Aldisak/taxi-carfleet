namespace Taxi.Api.Features.Orders.ReassignOrder;

/// <summary>Request body for POST /orders/{id}/reassign.</summary>
public sealed class ReassignOrderRequest
{
    /// <summary>Route-bound order ID.</summary>
    public Guid Id { get; set; }

    /// <summary>New driver row ID to reassign the order to.</summary>
    public Guid DriverId { get; set; }
}

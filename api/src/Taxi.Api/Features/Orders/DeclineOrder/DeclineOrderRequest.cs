namespace Taxi.Api.Features.Orders.DeclineOrder;

/// <summary>Request body for POST /orders/{id}/decline.</summary>
public sealed class DeclineOrderRequest
{
    /// <summary>Route-bound order ID.</summary>
    public Guid Id { get; set; }

    /// <summary>Reason the driver is declining. Must not be empty.</summary>
    public string Reason { get; set; } = string.Empty;
}

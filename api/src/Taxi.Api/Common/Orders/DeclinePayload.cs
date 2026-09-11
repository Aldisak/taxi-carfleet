namespace Taxi.Api.Common.Orders;

/// <summary>Payload for the <see cref="OrderTransition.Decline"/> transition.</summary>
/// <param name="Reason">Human-readable reason the driver declined the offer.</param>
public record DeclinePayload(string Reason);

namespace Taxi.Api.Common.Orders;

/// <summary>Payload for the <see cref="OrderTransition.Cancel"/> transition.</summary>
/// <param name="Reason">Human-readable cancellation reason. For driver no-show, use "no-show".</param>
public record CancelPayload(string Reason);

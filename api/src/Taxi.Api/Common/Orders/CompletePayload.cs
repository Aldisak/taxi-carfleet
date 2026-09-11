using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Common.Orders;

/// <summary>Payload for the <see cref="OrderTransition.Complete"/> transition.</summary>
/// <param name="FinalPriceCzk">Final price in CZK (integer).</param>
/// <param name="PaymentType">Payment method used.</param>
/// <param name="OverrideReason">Mandatory (≥ 5 chars) when <c>FinalPriceCzk ≠ FixedPriceCzk</c> on a Fixed-price order.</param>
public record CompletePayload(int FinalPriceCzk, PaymentType PaymentType, string? OverrideReason = null);

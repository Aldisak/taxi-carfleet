namespace Taxi.Api.Features.Pricing.Quote;

/// <summary>Price quote for a prospective order. Either a fixed price (route match) or an
/// estimate range (never a single exact estimate).</summary>
/// <param name="PriceType">"Fixed" when a matching route rule was found, else "Estimate".</param>
/// <param name="FixedPriceCzk">The fixed price in CZK when PriceType is Fixed; null otherwise.</param>
/// <param name="EstimateLowCzk">Lower bound of the estimate range in CZK when PriceType is Estimate; null otherwise.</param>
/// <param name="EstimateHighCzk">Upper bound of the estimate range in CZK when PriceType is Estimate; null otherwise. Strictly greater than EstimateLowCzk.</param>
public record QuoteResponse(
    string PriceType,
    int? FixedPriceCzk,
    int? EstimateLowCzk,
    int? EstimateHighCzk);

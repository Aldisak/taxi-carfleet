namespace Taxi.Api.Features.Pricing.Quote;

/// <summary>Price quote for a prospective order — a discriminated union on <see cref="Type"/>:
/// <list type="bullet">
/// <item><c>"Fixed"</c> → a matching route rule: PriceCzk, RouteId, RouteName populated.</item>
/// <item><c>"Estimate"</c> → tariff-priced range: LowCzk, HighCzk, DistanceKm, DurationMin populated
///   (LowCzk &lt; HighCzk always — never a single exact number).</item>
/// <item><c>"Meter"</c> → no route and no dropoff: BaseCzk, PerKmCzk, MinimumCzk tariff summary populated.</item>
/// </list>
/// The web client mirrors this shape byte-for-byte.</summary>
/// <param name="Type">Discriminator: "Fixed", "Estimate", or "Meter".</param>
/// <param name="PriceCzk">Fixed price in CZK (Fixed only).</param>
/// <param name="RouteId">Matched route id (Fixed only).</param>
/// <param name="RouteName">Matched route name (Fixed only).</param>
/// <param name="LowCzk">Lower estimate bound in CZK (Estimate only).</param>
/// <param name="HighCzk">Upper estimate bound in CZK (Estimate only; strictly &gt; LowCzk).</param>
/// <param name="DistanceKm">Route distance in kilometers (Estimate only).</param>
/// <param name="DurationMin">Route duration in minutes (Estimate only).</param>
/// <param name="BaseCzk">Tariff base fare in CZK (Meter only).</param>
/// <param name="PerKmCzk">Tariff per-km fare in CZK (Meter only).</param>
/// <param name="MinimumCzk">Tariff minimum fare in CZK (Meter only).</param>
public record QuoteResponse(
    string Type,
    int? PriceCzk = null,
    Guid? RouteId = null,
    string? RouteName = null,
    int? LowCzk = null,
    int? HighCzk = null,
    double? DistanceKm = null,
    int? DurationMin = null,
    int? BaseCzk = null,
    int? PerKmCzk = null,
    int? MinimumCzk = null);

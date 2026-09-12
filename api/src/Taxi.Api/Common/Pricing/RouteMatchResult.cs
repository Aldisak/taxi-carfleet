namespace Taxi.Api.Common.Pricing;

/// <summary>The result of a successful route match: the matched route's id, name, and fixed price.</summary>
/// <param name="RouteId">The matched route's id.</param>
/// <param name="RouteName">The matched route's display name.</param>
/// <param name="PriceCzk">The fixed price in CZK.</param>
public readonly record struct RouteMatchResult(Guid RouteId, string RouteName, int PriceCzk);

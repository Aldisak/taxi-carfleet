namespace Taxi.Api.Features.Orders.GetMyActiveOrder;

/// <summary>The caller's single non-terminal order for the Home sticky banner.</summary>
/// <param name="Id">Order identifier.</param>
/// <param name="PublicCode">Human-readable 6-char order code.</param>
/// <param name="Status">Current lifecycle status (string name).</param>
public record GetMyActiveOrderResponse(Guid Id, string PublicCode, string Status);

namespace Taxi.Api.Features.Orders.GetOrderByCode;

/// <summary>Request for GET /orders/by-code/{publicCode}.</summary>
public sealed class GetOrderByCodeRequest
{
    /// <summary>Route-bound 6-character public order code.</summary>
    public string PublicCode { get; set; } = string.Empty;
}

namespace Taxi.Api.Features.Drivers.GetMyOrders;

/// <summary>Request for GET /drivers/me/orders?date=.</summary>
public sealed class GetMyOrdersRequest
{
    /// <summary>Optional date in <c>yyyy-MM-dd</c> format. Absent or invalid → today (Europe/Prague).</summary>
    public string? Date { get; set; }
}

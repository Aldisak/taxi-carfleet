namespace Taxi.Api.Features.Drivers.GetMySummary;

/// <summary>Request for GET /drivers/me/summary?date=.</summary>
public sealed class GetMySummaryRequest
{
    /// <summary>Optional date in <c>yyyy-MM-dd</c> format. Absent or invalid → today (Europe/Prague).</summary>
    public string? Date { get; set; }
}

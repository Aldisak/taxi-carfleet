namespace Taxi.Api.Features.Routes.ListCommonRoutes;

/// <summary>Request for GET /routes/common. When ValidNow is true (default) only routes valid at
/// the current Europe/Prague time are returned.</summary>
public sealed class ListCommonRoutesRequest
{
    /// <summary>When true (default), filter to routes valid at the current Europe/Prague time/day.</summary>
    public bool ValidNow { get; set; } = true;
}

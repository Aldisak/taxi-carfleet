namespace Taxi.Api.Features.Admin.CreateFleet;

/// <summary>Request body for POST /admin/fleets.</summary>
public sealed class CreateFleetRequest
{
    /// <summary>Unique lowercase URL-safe slug (a-z, 0-9, hyphen).</summary>
    public string Slug { get; set; } = string.Empty;

    /// <summary>Fleet display name.</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>Fleet contact phone (E.164).</summary>
    public string Phone { get; set; } = string.Empty;

    /// <summary>Email for the auto-created FleetAdmin user.</summary>
    public string AdminEmail { get; set; } = string.Empty;
}

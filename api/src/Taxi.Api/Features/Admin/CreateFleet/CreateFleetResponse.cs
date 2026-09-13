namespace Taxi.Api.Features.Admin.CreateFleet;

/// <summary>Response for POST /admin/fleets. Carries the one-time FleetAdmin password exactly once.</summary>
/// <param name="FleetId">The newly created fleet id.</param>
/// <param name="Slug">The fleet slug.</param>
/// <param name="AdminEmail">The FleetAdmin login email.</param>
/// <param name="OneTimePassword">The FleetAdmin's generated one-time password — shown once, never logged.</param>
public record CreateFleetResponse(
    Guid FleetId,
    string Slug,
    string AdminEmail,
    string OneTimePassword);

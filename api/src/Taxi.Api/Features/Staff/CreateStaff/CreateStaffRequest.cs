namespace Taxi.Api.Features.Staff.CreateStaff;

/// <summary>Request body for creating a new staff user.</summary>
public sealed class CreateStaffRequest
{
    /// <summary>Email address for the new staff member. Must be unique per fleet.</summary>
    public string Email { get; init; } = string.Empty;

    /// <summary>Display name shown in the UI.</summary>
    public string DisplayName { get; init; } = string.Empty;

    /// <summary>Role of the new staff member. Must be Driver, Dispatcher, or FleetAdmin.</summary>
    public string Role { get; init; } = string.Empty;

    /// <summary>Optional phone number (E.164). Stored as empty string if omitted.</summary>
    public string? Phone { get; init; }
}

namespace Taxi.Api.Features.Staff.UpdateStaff;

/// <summary>Request body for updating an existing staff user.
/// Email and Role are immutable in v1; changing role would orphan or require driver row adjustments.</summary>
public sealed class UpdateStaffRequest
{
    /// <summary>Route parameter: the staff user ID to update.</summary>
    public Guid Id { get; init; }

    /// <summary>Updated display name.</summary>
    public string DisplayName { get; init; } = string.Empty;

    /// <summary>Optional phone number (E.164). Pass empty string or null to clear.</summary>
    public string? Phone { get; init; }

    /// <summary>Whether the user account is active.</summary>
    public bool IsActive { get; init; }
}

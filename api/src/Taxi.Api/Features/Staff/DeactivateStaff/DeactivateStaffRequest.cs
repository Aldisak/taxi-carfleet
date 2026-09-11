namespace Taxi.Api.Features.Staff.DeactivateStaff;

/// <summary>Route parameters for deactivating a staff user.</summary>
public sealed class DeactivateStaffRequest
{
    /// <summary>The staff user ID to deactivate.</summary>
    public Guid Id { get; init; }
}

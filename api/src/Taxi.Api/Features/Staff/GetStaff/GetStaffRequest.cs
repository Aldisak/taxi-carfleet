namespace Taxi.Api.Features.Staff.GetStaff;

/// <summary>Route parameters for getting a single staff user.</summary>
public sealed class GetStaffRequest
{
    /// <summary>The staff user's identifier.</summary>
    public Guid Id { get; init; }
}

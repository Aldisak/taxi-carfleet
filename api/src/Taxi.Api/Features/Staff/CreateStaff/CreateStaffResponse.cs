namespace Taxi.Api.Features.Staff.CreateStaff;

/// <summary>Response body for creating a new staff user.
/// The <see cref="TemporaryPassword"/> is the plaintext password returned EXACTLY ONCE —
/// it is never logged or stored in plaintext.</summary>
public record CreateStaffResponse(Guid Id, string TemporaryPassword);

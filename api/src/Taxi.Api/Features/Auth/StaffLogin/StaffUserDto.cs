namespace Taxi.Api.Features.Auth.StaffLogin;

/// <summary>Brief user info returned in auth responses.</summary>
/// <param name="Id">User identifier.</param>
/// <param name="Email">User email address.</param>
/// <param name="DisplayName">User display name.</param>
/// <param name="Role">User role string.</param>
public record StaffUserDto(
    Guid Id,
    string? Email,
    string DisplayName,
    string Role);

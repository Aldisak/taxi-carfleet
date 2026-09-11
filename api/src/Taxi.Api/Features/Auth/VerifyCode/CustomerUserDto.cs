namespace Taxi.Api.Features.Auth.VerifyCode;

/// <summary>Brief customer info returned in customer auth responses.</summary>
/// <param name="Id">User identifier.</param>
/// <param name="Phone">Customer phone number in E.164 format.</param>
/// <param name="DisplayName">Customer display name.</param>
/// <param name="Role">User role string (always "Customer").</param>
public record CustomerUserDto(
    Guid Id,
    string Phone,
    string DisplayName,
    string Role);

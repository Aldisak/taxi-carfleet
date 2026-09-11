namespace Taxi.Api.Features.Auth.StaffLogin;

/// <summary>Response returned when staff login succeeds.</summary>
/// <param name="AccessToken">The JWT access token (15-minute lifetime).</param>
/// <param name="RefreshToken">The opaque refresh token (30-day lifetime).</param>
/// <param name="User">Brief user info for the authenticated session.</param>
public record StaffLoginResponse(
    string AccessToken,
    string RefreshToken,
    StaffUserDto User);

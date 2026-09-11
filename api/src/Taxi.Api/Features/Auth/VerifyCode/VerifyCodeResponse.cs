namespace Taxi.Api.Features.Auth.VerifyCode;

/// <summary>Response returned when customer verification succeeds.</summary>
/// <param name="AccessToken">The JWT access token (15-minute lifetime).</param>
/// <param name="RefreshToken">The opaque refresh token (30-day lifetime).</param>
/// <param name="User">Brief customer info for the authenticated session.</param>
public record VerifyCodeResponse(
    string AccessToken,
    string RefreshToken,
    CustomerUserDto User);

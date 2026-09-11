namespace Taxi.Api.Features.Auth.Refresh;

/// <summary>Response returned when a refresh token is successfully rotated.</summary>
/// <param name="AccessToken">A new JWT access token (15-minute lifetime).</param>
/// <param name="RefreshToken">A new opaque refresh token (30-day lifetime). The previous token is now revoked.</param>
public record RefreshResponse(
    string AccessToken,
    string RefreshToken);

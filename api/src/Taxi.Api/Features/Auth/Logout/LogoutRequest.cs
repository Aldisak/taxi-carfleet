namespace Taxi.Api.Features.Auth.Logout;

/// <summary>Request body for <c>POST /api/v1/auth/logout</c>.</summary>
public record LogoutRequest(string? RefreshToken);

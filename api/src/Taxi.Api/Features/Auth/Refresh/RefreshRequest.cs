namespace Taxi.Api.Features.Auth.Refresh;

/// <summary>Request body for <c>POST /api/v1/auth/refresh</c>.</summary>
public record RefreshRequest(string RefreshToken);

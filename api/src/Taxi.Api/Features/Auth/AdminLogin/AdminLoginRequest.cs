namespace Taxi.Api.Features.Auth.AdminLogin;

/// <summary>Request body for <c>POST /api/v1/auth/admin/login</c> — fleetless SuperAdmin login.</summary>
public record AdminLoginRequest(string Email, string Password);

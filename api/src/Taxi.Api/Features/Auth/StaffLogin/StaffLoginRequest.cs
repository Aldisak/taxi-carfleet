namespace Taxi.Api.Features.Auth.StaffLogin;

/// <summary>Request body for <c>POST /api/v1/auth/staff/login</c>.</summary>
public record StaffLoginRequest(string FleetSlug, string Email, string Password);

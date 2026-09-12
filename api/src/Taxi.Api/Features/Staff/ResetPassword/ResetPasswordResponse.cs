namespace Taxi.Api.Features.Staff.ResetPassword;

/// <summary>Response returned exactly once after a successful password reset.</summary>
public record ResetPasswordResponse(string TemporaryPassword);

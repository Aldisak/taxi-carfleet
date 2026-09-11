namespace Taxi.Api.Features.Auth.VerifyCode;

/// <summary>Request body for <c>POST /api/v1/auth/customer/verify-code</c>.</summary>
public record VerifyCodeRequest(string Phone, string Code);

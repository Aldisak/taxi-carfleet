namespace Taxi.Api.Features.Auth.RequestCode;

/// <summary>Request body for <c>POST /api/v1/auth/customer/request-code</c>.</summary>
public record RequestCodeRequest(string Phone);

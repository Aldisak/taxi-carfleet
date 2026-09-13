namespace Taxi.Api.Features.Customers.DeleteMe;

/// <summary>Request body for DELETE /customers/me — the SMS confirmation code.</summary>
public sealed class DeleteMeRequest
{
    /// <summary>The SMS code the customer already requested (via /auth/customer/request-code) for their phone.</summary>
    public string Code { get; set; } = string.Empty;
}

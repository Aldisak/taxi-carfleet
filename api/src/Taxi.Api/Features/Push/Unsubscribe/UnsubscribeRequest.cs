namespace Taxi.Api.Features.Push.Unsubscribe;

/// <summary>Request body for DELETE /push/subscriptions. Endpoint is plain (no <c>required</c>) so a
/// missing field is a clean 400 from the validator rather than an STJ 500.</summary>
public sealed class UnsubscribeRequest
{
    /// <summary>Browser push endpoint URL to remove.</summary>
    public string Endpoint { get; init; } = string.Empty;
}

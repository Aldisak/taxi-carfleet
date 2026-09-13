namespace Taxi.Api.Features.Push.Subscribe;

/// <summary>Request body for POST /push/subscriptions. Fields are plain (no <c>required</c>) so a
/// missing field is a clean 400 from the validator rather than an STJ 500 (CLAUDE.md STJ trap).</summary>
public sealed class SubscribeRequest
{
    /// <summary>Browser push endpoint URL.</summary>
    public string Endpoint { get; init; } = string.Empty;

    /// <summary>P-256 ECDH public key (base64url).</summary>
    public string P256dh { get; init; } = string.Empty;

    /// <summary>Auth secret (base64url).</summary>
    public string Auth { get; init; } = string.Empty;

    /// <summary>Optional user-agent string of the subscribing device.</summary>
    public string? UserAgent { get; init; }
}

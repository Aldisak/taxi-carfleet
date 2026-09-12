using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;

namespace Taxi.Api.Common.Tracking;

/// <summary>Mints and validates the public SMS tracking-link token.
/// <para>Token layout: <c>Base64Url("{expUnixSeconds}.{signature}")</c> where
/// <c>signature = Base64Url(HMACSHA256(key, "{orderId}:{expUnixSeconds}"))</c>. The order id is NOT
/// stored in the token body — it is supplied by the caller at validation time (resolved from the
/// public code within the fleet scope), so the HMAC binds the token to a specific order and expiry.</para>
/// <para>Validation (<see cref="Validate"/>) checks the signature (constant-time compare), that
/// now &lt; exp, and — for a completed order — that now is within 2h of completion. The
/// "2h after completion" rule is a validation-time concern (completion is unknown at mint time).</para>
/// <para>The raw token and HMAC key are never logged (rules/logging.md).</para></summary>
internal sealed class TrackingTokenService(IOptions<TrackingOptions> options, TimeProvider timeProvider)
{
    /// <summary>Buffer after a completed ride during which the tracking link stays valid.</summary>
    public static readonly TimeSpan PostCompletionWindow = TimeSpan.FromHours(2);

    private readonly byte[] _key = Encoding.UTF8.GetBytes(options.Value.HmacKey);

    /// <summary>Mints a tracking token for the given order, valid until <paramref name="expiresAt"/>.</summary>
    /// <param name="orderId">The order the token grants read access to.</param>
    /// <param name="expiresAt">Absolute expiry of the link.</param>
    /// <returns>The opaque, URL-safe token string.</returns>
    public string Mint(Guid orderId, DateTimeOffset expiresAt)
    {
        var exp = expiresAt.ToUnixTimeSeconds();
        var signature = ComputeSignature(orderId, exp);
        var body = $"{exp}.{signature}";
        return Base64UrlEncode(Encoding.UTF8.GetBytes(body));
    }

    /// <summary>Validates a token against the given order. Returns true only when the signature
    /// verifies, the token has not expired, and (for a completed order) the post-completion window
    /// has not elapsed.</summary>
    /// <param name="token">The raw token from the query string.</param>
    /// <param name="orderId">The order id resolved from the public code (fleet-scoped).</param>
    /// <param name="completedAt">The order's completion timestamp, or null if not completed.</param>
    /// <returns>True when the token is valid for this order right now.</returns>
    public bool Validate(string token, Guid orderId, DateTimeOffset? completedAt)
    {
        if (string.IsNullOrEmpty(token)) return false;

        byte[] decoded;
        try
        {
            decoded = Base64UrlDecode(token);
        }
        catch (FormatException)
        {
            return false;
        }

        var body = Encoding.UTF8.GetString(decoded);
        var separator = body.IndexOf('.');
        if (separator <= 0) return false;

        var expPart = body[..separator];
        var signaturePart = body[(separator + 1)..];

        if (!long.TryParse(expPart, out var exp)) return false;

        var expectedSignature = ComputeSignature(orderId, exp);

        // Constant-time compare to avoid signature-timing leaks (F-03).
        var providedBytes = Encoding.ASCII.GetBytes(signaturePart);
        var expectedBytes = Encoding.ASCII.GetBytes(expectedSignature);
        if (!CryptographicOperations.FixedTimeEquals(providedBytes, expectedBytes)) return false;

        var now = timeProvider.GetUtcNow();

        // Absolute expiry.
        if (now >= DateTimeOffset.FromUnixTimeSeconds(exp)) return false;

        // Post-completion window (validation-time rule).
        if (completedAt.HasValue && now >= completedAt.Value + PostCompletionWindow) return false;

        return true;
    }

    private string ComputeSignature(Guid orderId, long exp)
    {
        var payload = Encoding.UTF8.GetBytes($"{orderId:D}:{exp}");
        var hash = HMACSHA256.HashData(_key, payload);
        return Base64UrlEncode(hash);
    }

    private static string Base64UrlEncode(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static byte[] Base64UrlDecode(string value)
    {
        var padded = value.Replace('-', '+').Replace('_', '/');
        switch (padded.Length % 4)
        {
            case 2: padded += "=="; break;
            case 3: padded += "="; break;
        }
        return Convert.FromBase64String(padded);
    }
}

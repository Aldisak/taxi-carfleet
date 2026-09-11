using System.Security.Cryptography;
using System.Text;
using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Common;
using Taxi.Api.Common.Features;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Infrastructure.Sms;

namespace Taxi.Api.Features.Auth.RequestCode;

/// <summary>Sends an SMS verification code to the customer's phone number.
/// Rate-limited to 3 codes per phone per 10 minutes and 1 code per phone per 60 seconds.
/// AllowAnonymous — no JWT required; this is the first step of customer authentication.</summary>
internal sealed class RequestCodeEndpoint(TaxiDbContext dbContext, ISmsSender smsSender, TimeProvider timeProvider)
    : Endpoint<RequestCodeRequest>
{
    // Code lifetime: 5 minutes. Rate-limit windows use ExpiresAt arithmetic since SmsCode has no CreatedAt.
    // Creation time ≡ ExpiresAt - CodeLifetime, so a threshold on ExpiresAt is equivalent to a threshold on CreatedAt.
    private static readonly TimeSpan CodeLifetime = TimeSpan.FromMinutes(5);
    private static readonly TimeSpan RateLimitWindow = TimeSpan.FromMinutes(10);
    private static readonly TimeSpan MinGapBetweenSends = TimeSpan.FromSeconds(60);
    private const int MaxCodesPerWindow = 3;

    private readonly AuthFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Post("auth/customer/request-code");
        Description(builder => builder
            .WithName(nameof(RequestCodeEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        AllowAnonymous();

        Summary(s =>
        {
            s.Summary = "Request customer SMS code";
            s.Description = "Sends a 6-digit OTP to the customer's phone. " +
                             "AllowAnonymous — unauthenticated entry point for customer login flow. " +
                             "Rate-limited: max 3 per phone per 10 min and min 60 s between sends.";
            s.Responses[StatusCodes.Status204NoContent] = "Code sent successfully.";
            s.Responses[StatusCodes.Status400BadRequest] = "Request validation failed.";
            s.Responses[StatusCodes.Status429TooManyRequests] = "Rate limit exceeded.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(RequestCodeRequest req, CancellationToken ct)
    {
        if (!PhoneNormalizer.TryNormalize(req.Phone, out var phone) || phone is null)
        {
            AddError(r => r.Phone, "Phone number is not a valid E.164 or normalizable Czech number.", ErrorCodes.Validation.PhoneInvalid);
            await Send.ErrorsAsync(400, ct);
            return;
        }

        var now = timeProvider.GetUtcNow();

        // Rate limit: max 3 codes per phone per 10 min (derived via ExpiresAt arithmetic).
        // CodeCreatedAt ≡ ExpiresAt - CodeLifetime, so codes created within the 10-min window
        // have ExpiresAt > now - 10min + CodeLifetime.
        var windowThreshold = now - RateLimitWindow + CodeLifetime;
        var codesInWindow = await dbContext.SmsCodes
            .CountAsync(x => x.Phone == phone && x.ExpiresAt > windowThreshold, ct);

        if (codesInWindow >= MaxCodesPerWindow)
        {
            AddError(r => r.Phone, "Too many SMS code requests.", ErrorCodes.Auth.TooManyRequests);
            await Send.ErrorsAsync(429, ct);
            return;
        }

        // Rate limit: min 60 s between sends (same ExpiresAt arithmetic).
        // Last code created within 60s: ExpiresAt > now - 60s + CodeLifetime.
        var gapThreshold = now - MinGapBetweenSends + CodeLifetime;
        var hasRecentCode = await dbContext.SmsCodes
            .AnyAsync(x => x.Phone == phone && x.ExpiresAt > gapThreshold, ct);

        if (hasRecentCode)
        {
            AddError(r => r.Phone, "Too many SMS code requests.", ErrorCodes.Auth.TooManyRequests);
            await Send.ErrorsAsync(429, ct);
            return;
        }

        // Generate 6-digit OTP and hash it for storage.
        var rawCode = RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6");
        var codeHash = ComputeCodeHash(rawCode);

        var smsCode = new SmsCode
        {
            Id = Guid.CreateVersion7(),
            Phone = phone,
            CodeHash = codeHash,
            ExpiresAt = now.Add(CodeLifetime),
            Attempts = 0
        };

        dbContext.SmsCodes.Add(smsCode);
        await dbContext.SaveChangesAsync(ct);

        // Send SMS — message contains the raw code; do NOT log the message body.
        await smsSender.SendAsync(phone, $"Your Taxi verification code: {rawCode}", ct);

        await Send.NoContentAsync(ct);
    }

    /// <summary>Computes the SHA-256 hex hash of the raw OTP code for safe storage.</summary>
    private static string ComputeCodeHash(string rawCode)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(rawCode));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }
}

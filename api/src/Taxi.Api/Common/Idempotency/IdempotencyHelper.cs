using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Common.Idempotency;

/// <summary>Claim-then-execute idempotency helper for driver transition endpoints.
/// Reads the optional <c>X-Idempotency-Key</c> header; when absent the delegate executes normally
/// and no record is written.
/// <para>
/// <b>RequestHash</b>: SHA-256 of <c>{METHOD}:{path}:{JsonSerializer.Serialize(req)}</c>.
/// Because FastEndpoints has already bound the request DTO before <c>HandleAsync</c> runs,
/// the raw body is no longer readable. Serialising the bound DTO is deterministic for identical requests.
/// </para>
/// <para>
/// <b>Branch order on 23505 (design-review F-05)</b>: hash-mismatch → 409 KeyReused FIRST;
/// stored response → replay; in-flight &lt; 60 s → 409 InFlight; orphaned ≥ 60 s → takeover.
/// </para>
/// <para>
/// <b>Change-tracker detachment (design-review F-06)</b>: after a 23505 failure the failed
/// claim entry is detached from the change tracker before any further use of the scoped context.
/// </para>
/// <para>
/// <b>Storage contract</b>: any outcome with <c>statusCode &lt; 500</c> is stored (including 4xx
/// with a null body — e.g. 404 from <c>Send.NotFoundAsync</c> which writes no body).
/// A 5xx is never stored so a retry always re-executes. The committed-takeover contract:
/// when a takeover re-executes a transition that was already committed, the result is typically
/// a 409 state conflict; that 409 is stored and stable so a subsequent third call replays it
/// rather than hitting the InFlight branch.
/// </para>
/// </summary>
internal static class IdempotencyHelper
{
    private const string HeaderName = "X-Idempotency-Key";
    private const int MaxKeyLength = 200;
    private const string UniqueViolationSqlState = "23505";
    private static readonly TimeSpan OrphanThreshold = TimeSpan.FromSeconds(60);
    private static readonly TimeSpan ReplayWindow = TimeSpan.FromHours(24);

    // Use camelCase + string enums to match FastEndpoints' global JSON serialization configuration.
    private static readonly JsonSerializerOptions StorageSerializerOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        Converters = { new JsonStringEnumConverter() }
    };

    /// <summary>Executes <paramref name="executeAsync"/> with idempotency semantics.
    /// When no <c>X-Idempotency-Key</c> header is present the delegate executes normally and no record is written.
    /// When a key is present the helper owns the full request lifecycle — the endpoint must call
    /// <c>Send.*Async</c> only inside the delegate.
    /// </summary>
    /// <typeparam name="TRequest">The FastEndpoints request type.</typeparam>
    /// <param name="httpContext">The current HTTP context (from the endpoint).</param>
    /// <param name="dbContext">The scoped database context.</param>
    /// <param name="timeProvider">Injected time provider.</param>
    /// <param name="req">The bound request DTO (used for hashing).</param>
    /// <param name="executeAsync">
    /// Delegate that performs the actual transition. It receives a <c>storeAsync(statusCode, body)</c>
    /// callback that must be called before each <c>Send.*Async</c> call (pass null body for status-only
    /// responses such as 404). Any <c>statusCode &lt; 500</c> is persisted; 5xx are never stored.
    /// </param>
    /// <param name="ct">Cancellation token.</param>
    public static async Task HandleAsync<TRequest>(
        HttpContext httpContext,
        TaxiDbContext dbContext,
        TimeProvider timeProvider,
        TRequest req,
        Func<Func<int, object?, Task>, CancellationToken, Task> executeAsync,
        CancellationToken ct)
    {
        // No header → execute normally, write nothing.
        if (!httpContext.Request.Headers.TryGetValue(HeaderName, out var keyValues)
            || string.IsNullOrEmpty(keyValues))
        {
            await executeAsync((_, _) => Task.CompletedTask, ct);
            return; // response already written by delegate
        }

        var key = keyValues.ToString();

        // Key too long → 400.
        if (key.Length > MaxKeyLength)
        {
            await WriteErrorResponseAsync(httpContext, 400, ErrorCodes.Idempotency.KeyTooLong,
                "X-Idempotency-Key must be at most 200 characters.", ct);
            return;
        }

        // Resolve the caller's UserId from the sub claim.
        var subClaim = httpContext.User.FindFirst("sub")?.Value;
        if (string.IsNullOrEmpty(subClaim) || !Guid.TryParse(subClaim, out var userId))
        {
            // No authenticated user — fall through to normal execution; the endpoint guards identity.
            await executeAsync((_, _) => Task.CompletedTask, ct);
            return;
        }

        var requestHash = ComputeHash(httpContext.Request.Method, httpContext.Request.Path, req);
        var now = timeProvider.GetUtcNow();

        // Opportunistic purge: remove records older than 24 h (bounded, cheap, no new job).
        await dbContext.IdempotencyRecords
            .Where(r => r.CreatedAt < now - ReplayWindow)
            .ExecuteDeleteAsync(ct);

        // Attempt to INSERT the claim row (null ResponseStatus/ResponseBody = in-flight marker).
        var claim = new IdempotencyRecord
        {
            Id = Guid.CreateVersion7(),
            UserId = userId,
            Key = key,
            RequestHash = requestHash,
            CreatedAt = now
        };
        dbContext.IdempotencyRecords.Add(claim);

        try
        {
            await dbContext.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: UniqueViolationSqlState })
        {
            // F-06: detach the failed claim entry before re-using this scoped context.
            dbContext.Entry(claim).State = EntityState.Detached;

            // Load the existing record.
            var existing = await dbContext.IdempotencyRecords
                .AsNoTracking()
                .FirstOrDefaultAsync(r => r.UserId == userId && r.Key == key, ct);

            if (existing is null)
            {
                // Extremely unlikely: row purged between INSERT and re-read. Execute normally.
                await executeAsync((_, _) => Task.CompletedTask, ct);
                return;
            }

            // F-05 branch order (design-review binding):
            // 1. Hash mismatch → KeyReused (regardless of stored state).
            if (existing.RequestHash != requestHash)
            {
                await WriteErrorResponseAsync(httpContext, 409, ErrorCodes.Idempotency.KeyReused,
                    "The same idempotency key was used for a different request.", ct);
                return;
            }

            // 2. Stored response present — status is enough; body may be null (e.g. 404 has no body).
            if (existing.ResponseStatus.HasValue)
            {
                await ReplayStoredResponseAsync(httpContext, existing, ct);
                return;
            }

            // 3. In-flight (claim exists, no response, younger than 60 s) → InFlight.
            if (now - existing.CreatedAt < OrphanThreshold)
            {
                await WriteErrorResponseAsync(httpContext, 409, ErrorCodes.Idempotency.InFlight,
                    "A request with this idempotency key is already in flight; retry after it completes.", ct);
                return;
            }

            // 4. Orphaned (claim older than 60 s, no response) → take over: re-execute and store.
            await dbContext.IdempotencyRecords
                .Where(r => r.UserId == userId && r.Key == key)
                .ExecuteUpdateAsync(s => s
                    .SetProperty(r => r.CreatedAt, now)
                    .SetProperty(r => r.RequestHash, requestHash),
                    ct);

            await ExecuteAndStoreAsync(dbContext, userId, key, requestHash, executeAsync, ct);
            return;
        }

        // We own the lock — execute and store.
        await ExecuteAndStoreAsync(dbContext, userId, key, requestHash, executeAsync, ct);
    }

    /// <summary>Executes the transition delegate and stores the result.
    /// Any <c>statusCode &lt; 500</c> is persisted (body may be null — e.g. 404 from
    /// <c>Send.NotFoundAsync</c> writes no body). 5xx are never stored.</summary>
    private static async Task ExecuteAndStoreAsync(
        TaxiDbContext dbContext,
        Guid userId,
        string key,
        string requestHash,
        Func<Func<int, object?, Task>, CancellationToken, Task> executeAsync,
        CancellationToken ct)
    {
        await executeAsync(async (statusCode, body) =>
        {
            // Store any non-5xx outcome. 5xx are never stored — a retry must re-execute.
            if (statusCode < 500)
            {
                var bodyJson = body is not null
                    ? JsonDocument.Parse(JsonSerializer.Serialize(body, StorageSerializerOptions))
                    : null;
                await dbContext.IdempotencyRecords
                    .Where(r => r.UserId == userId && r.Key == key && r.RequestHash == requestHash)
                    .ExecuteUpdateAsync(s => s
                        .SetProperty(r => r.ResponseStatus, statusCode)
                        .SetProperty(r => r.ResponseBody, bodyJson),
                        ct);
            }
        }, ct);
    }

    /// <summary>Replays a stored response verbatim: sets the status code and writes the JSON body if present.
    /// When <see cref="IdempotencyRecord.ResponseBody"/> is <see langword="null"/> (e.g. a stored 404
    /// from <c>Send.NotFoundAsync</c> or a 409 state-conflict) an empty JSON object is written to prevent
    /// FastEndpoints from overwriting the status with its own 204 No Content default.</summary>
    private static async Task ReplayStoredResponseAsync(
        HttpContext httpContext,
        IdempotencyRecord record,
        CancellationToken ct)
    {
        httpContext.Response.StatusCode = record.ResponseStatus!.Value;
        httpContext.Response.ContentType = "application/json; charset=utf-8";

        var json = record.ResponseBody is not null
            ? record.ResponseBody.RootElement.GetRawText()
            : "{}";
        await httpContext.Response.WriteAsync(json, ct);
    }

    /// <summary>Writes a ProblemDetails error response matching FastEndpoints' <c>UseProblemDetails</c>
    /// format (same shape that <c>Send.ErrorsAsync</c> and <see cref="ValidationFailureExceptionHandler"/>
    /// produce) so B-queue can parse a single envelope shape.</summary>
    private static async Task WriteErrorResponseAsync(
        HttpContext httpContext,
        int statusCode,
        string errorCode,
        string message,
        CancellationToken ct)
    {
        httpContext.Response.StatusCode = statusCode;
        httpContext.Response.ContentType = "application/problem+json; charset=utf-8";

        // Inline ProblemDetails with Extensions["errors"] matching FastEndpoints' UseProblemDetails output.
        var body = new
        {
            status = statusCode,
            title = "One or more validation errors occurred.",
            type = $"https://httpstatuses.com/{statusCode}",
            errors = new[]
            {
                new { name = string.Empty, reason = message, code = errorCode }
            }
        };
        await httpContext.Response.WriteAsJsonAsync(body, ct);
    }

    /// <summary>Computes SHA-256 hex of <c>{method}:{path}:{serializedRequest}</c>.
    /// Uses camelCase serialization to produce a stable, encoding-consistent hash.</summary>
    private static string ComputeHash<TRequest>(string method, string path, TRequest req)
    {
        var input = $"{method}:{path}:{JsonSerializer.Serialize(req, StorageSerializerOptions)}";
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(input));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }
}

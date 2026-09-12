using System.Text.Json;

namespace Taxi.Api.Infrastructure.Entities;

/// <summary>A record used for idempotent execution of driver transition requests.
/// Keyed by <c>(UserId, Key)</c> with a unique index — the first INSERT wins the execution lock.
/// Not a tenant entity: UserId-scoped, mirrors the <see cref="RefreshToken"/>/<c>SmsCode</c> precedent.</summary>
public class IdempotencyRecord
{
    /// <summary>Primary key (UUIDv7, app-generated).</summary>
    public Guid Id { get; set; }

    /// <summary>The user who submitted the idempotent request.</summary>
    public Guid UserId { get; set; }

    /// <summary>The caller-supplied idempotency key (max 200 chars).</summary>
    public required string Key { get; set; }

    /// <summary>SHA-256 hex of method+path+serialized-request. Used to detect key reuse for a different request.</summary>
    public required string RequestHash { get; set; }

    /// <summary>HTTP status code of the stored response. Null while the execution is in flight.</summary>
    public int? ResponseStatus { get; set; }

    /// <summary>JSON body of the stored response, stored as jsonb. Null while the execution is in flight.</summary>
    public JsonDocument? ResponseBody { get; set; }

    /// <summary>UTC timestamp when this record was created (the claim was inserted).</summary>
    public DateTimeOffset CreatedAt { get; set; }
}

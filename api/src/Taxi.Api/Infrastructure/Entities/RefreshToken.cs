namespace Taxi.Api.Infrastructure.Entities;

/// <summary>A refresh token used for rotating JWT authentication. Not scoped to a fleet.</summary>
public class RefreshToken
{
    /// <summary>Primary key (UUIDv7, app-generated).</summary>
    public Guid Id { get; set; }

    /// <summary>User who owns this token.</summary>
    public Guid UserId { get; set; }

    /// <summary>SHA-256 hash of the token value.</summary>
    public required string TokenHash { get; set; }

    /// <summary>UTC timestamp when this token expires.</summary>
    public DateTimeOffset ExpiresAt { get; set; }

    /// <summary>UTC timestamp when this token was revoked. Null if still valid.</summary>
    public DateTimeOffset? RevokedAt { get; set; }

    /// <summary>UTC timestamp when this token was created.</summary>
    public DateTimeOffset CreatedAt { get; set; }
}

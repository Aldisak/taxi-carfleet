namespace Taxi.Api.Infrastructure.Entities;

/// <summary>A one-time SMS verification code used for customer authentication. Not scoped to a fleet.</summary>
public class SmsCode
{
    /// <summary>Primary key (UUIDv7, app-generated).</summary>
    public Guid Id { get; set; }

    /// <summary>E.164 phone number the code was sent to.</summary>
    public required string Phone { get; set; }

    /// <summary>Hash of the SMS verification code.</summary>
    public required string CodeHash { get; set; }

    /// <summary>UTC timestamp when the code expires.</summary>
    public DateTimeOffset ExpiresAt { get; set; }

    /// <summary>Number of failed verification attempts.</summary>
    public int Attempts { get; set; }

    /// <summary>UTC timestamp when the code was successfully used. Null if not yet used.</summary>
    public DateTimeOffset? UsedAt { get; set; }
}

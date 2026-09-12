namespace Taxi.Api.Infrastructure.Entities;

/// <summary>A taxi fleet operating under a unique slug. Every tenant-owned entity references a fleet.</summary>
public class Fleet
{
    /// <summary>Primary key (UUIDv7, app-generated).</summary>
    public Guid Id { get; set; }

    /// <summary>Lowercase, URL-safe identifier (a-z0-9-). Unique across all fleets.</summary>
    public required string Slug { get; set; }

    /// <summary>Display name of the fleet.</summary>
    public required string Name { get; set; }

    /// <summary>Contact phone number for the fleet.</summary>
    public required string Phone { get; set; }

    /// <summary>ISO 4217 currency code. Defaults to CZK.</summary>
    public string Currency { get; set; } = "CZK";

    /// <summary>IANA time zone identifier. Defaults to Europe/Prague.</summary>
    public string TimeZone { get; set; } = "Europe/Prague";

    /// <summary>Optional brand primary color as a #RRGGBB hex string. Null falls back to the client theme token.</summary>
    public string? PrimaryColorHex { get; set; }

    /// <summary>Whether the fleet is currently active.</summary>
    public bool IsActive { get; set; }

    /// <summary>UTC timestamp when the fleet record was created.</summary>
    public DateTimeOffset CreatedAt { get; set; }
}

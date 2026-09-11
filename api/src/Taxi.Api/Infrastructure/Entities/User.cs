namespace Taxi.Api.Infrastructure.Entities;

/// <summary>A system user. Customers have <see cref="UserRole.Customer"/> and a nullable <see cref="FleetId"/>.
/// Staff (Driver, Dispatcher, FleetAdmin) are scoped to a fleet. SuperAdmin is cross-fleet.</summary>
public class User
{
    /// <summary>Primary key (UUIDv7, app-generated).</summary>
    public Guid Id { get; set; }

    /// <summary>Fleet this user belongs to. Null for Customer and SuperAdmin roles.</summary>
    public Guid? FleetId { get; set; }

    /// <summary>Role of the user in the system.</summary>
    public UserRole Role { get; set; }

    /// <summary>Email address. Unique per fleet when non-null. Null for customers.</summary>
    public string? Email { get; set; }

    /// <summary>BCrypt password hash. Null for customers (who authenticate via SMS code).</summary>
    public string? PasswordHash { get; set; }

    /// <summary>E.164 phone number. Unique for Customer-role users.</summary>
    public required string Phone { get; set; }

    /// <summary>Display name shown in the UI.</summary>
    public required string DisplayName { get; set; }

    /// <summary>Whether the user account is active.</summary>
    public bool IsActive { get; set; }

    /// <summary>UTC timestamp when the user account was created.</summary>
    public DateTimeOffset CreatedAt { get; set; }

    /// <summary>UTC timestamp of the user's most recent successful login. Null until first login.</summary>
    public DateTimeOffset? LastLoginAt { get; set; }
}

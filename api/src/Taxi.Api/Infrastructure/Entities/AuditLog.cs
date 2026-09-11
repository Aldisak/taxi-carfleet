using System.Text.Json;
using Taxi.Api.Common.Tenancy;

namespace Taxi.Api.Infrastructure.Entities;

/// <summary>Generic audit record for non-order entity changes. Provisioned now; populated in a later assignment.</summary>
public class AuditLog : ITenantEntity
{
    /// <summary>Primary key (UUIDv7, app-generated).</summary>
    public Guid Id { get; set; }

    /// <summary>Fleet context for this audit entry.</summary>
    public Guid FleetId { get; set; }

    /// <summary>User who performed the audited action. Null for system-initiated actions.</summary>
    public Guid? ActorUserId { get; set; }

    /// <summary>Name of the entity type that was changed (e.g. "Vehicle", "User").</summary>
    public required string Entity { get; set; }

    /// <summary>Primary key of the changed entity.</summary>
    public Guid EntityId { get; set; }

    /// <summary>Action performed (e.g. "Create", "Update", "Delete").</summary>
    public required string Action { get; set; }

    /// <summary>JSON diff of the changes (stored as jsonb). Null for creation/deletion where diff is not applicable.</summary>
    public JsonDocument? Diff { get; set; }

    /// <summary>UTC timestamp when the audited action occurred.</summary>
    public DateTimeOffset At { get; set; }
}

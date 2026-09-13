namespace Taxi.Api.Features.Audit.GetAudit;

/// <summary>One entry in the unified audit timeline, projected from either an order_event or an audit_log.</summary>
/// <param name="Source">Origin table: <c>OrderEvent</c> or <c>AuditLog</c>.</param>
/// <param name="ActorUserId">User who performed the action; null for system-initiated events.</param>
/// <param name="Entity">Entity type name (always <c>Order</c> for order events).</param>
/// <param name="Action">The event type (order events) or action verb (audit logs).</param>
/// <param name="OrderCode">The related order's public code; null for non-order audit entries.</param>
/// <param name="At">UTC timestamp of the entry.</param>
public record AuditEntryDto(
    string Source,
    Guid? ActorUserId,
    string Entity,
    string Action,
    string? OrderCode,
    DateTimeOffset At);

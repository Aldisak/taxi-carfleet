using System.Globalization;
using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Features.Audit.GetAudit;

/// <summary>Returns a paged, descending-by-time unified audit timeline merging <c>order_events</c> and
/// <c>audit_logs</c>. FleetAdmin only; read-only; auto tenant-scoped by both entities' global query
/// filters. Filters (actor, entity, from/to, orderCode) are applied BEFORE paging. The two sources are
/// projected to one shape and merged with <c>.Concat()</c> → SQL <c>UNION ALL</c>, then
/// <c>OrderByDescending(At).ThenByDescending(Id)</c> + <c>Skip/Take</c>. The jsonb Payload/Diff columns
/// are never projected in SQL (CLAUDE.md WI-10); order codes are resolved from a separate id→code lookup.</summary>
internal sealed class GetAuditEndpoint(TaxiDbContext dbContext)
    : Endpoint<GetAuditRequest, GetAuditResponse>
{
    private static readonly TimeZoneInfo PragueZone = TimeZoneInfo.FindSystemTimeZoneById("Europe/Prague");

    private readonly AuditFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Get("audit");
        Description(builder => builder
            .WithName(nameof(GetAuditEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.FleetAdminOnly));

        Summary(s =>
        {
            s.Summary = "Audit timeline (FleetAdmin)";
            s.Description = "Paged, descending merge of order_events + audit_logs, filterable by actor, " +
                            "entity, date range, and order code. Read-only and tenant-scoped.";
            s.Responses[StatusCodes.Status200OK] = "Paged audit timeline.";
            s.Responses[StatusCodes.Status400BadRequest] = "Invalid paging or date.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a fleet admin.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(GetAuditRequest req, CancellationToken ct)
    {
        var (winStart, winEnd) = ParseWindow(req.From, req.To);

        // Resolve the order-code filter to a single order id up-front (tenant-scoped). A non-matching
        // code yields an empty result rather than leaking cross-fleet rows.
        Guid? orderCodeId = null;
        if (!string.IsNullOrWhiteSpace(req.OrderCode))
        {
            orderCodeId = await dbContext.Orders.AsNoTracking()
                .Where(o => o.PublicCode == req.OrderCode)
                .Select(o => (Guid?)o.Id)
                .FirstOrDefaultAsync(ct);

            if (orderCodeId is null)
            {
                await Send.OkAsync(new GetAuditResponse([], 0, req.Page, req.PageSize), ct);
                return;
            }
        }

        // Order-events projection (Entity is always "Order"; Action is the event type).
        var eventRows = dbContext.OrderEvents.AsNoTracking()
            .Where(e => req.Actor == null || e.ActorUserId == req.Actor)
            .Where(e => winStart == null || e.At >= winStart)
            .Where(e => winEnd == null || e.At < winEnd)
            .Where(e => req.Entity == null || req.Entity == "Order")
            .Where(e => orderCodeId == null || e.OrderId == orderCodeId)
            .Select(e => new AuditRow
            {
                Source = "OrderEvent",
                ActorUserId = e.ActorUserId,
                Entity = "Order",
                Action = e.Type.ToString(),
                OrderId = e.OrderId,
                At = e.At,
                Id = e.Id
            });

        // Audit-log projection (Entity + Action come from the row; no order code).
        var auditRows = dbContext.AuditLogs.AsNoTracking()
            .Where(a => req.Actor == null || a.ActorUserId == req.Actor)
            .Where(a => winStart == null || a.At >= winStart)
            .Where(a => winEnd == null || a.At < winEnd)
            .Where(a => req.Entity == null || a.Entity == req.Entity)
            .Where(a => orderCodeId == null) // audit logs are not order-scoped; excluded when filtering by code
            .Select(a => new AuditRow
            {
                Source = "AuditLog",
                ActorUserId = a.ActorUserId,
                Entity = a.Entity,
                Action = a.Action,
                OrderId = null,
                At = a.At,
                Id = a.Id
            });

        var merged = eventRows.Concat(auditRows);

        var total = await merged.CountAsync(ct);

        var pageRows = await merged
            .OrderByDescending(r => r.At)
            .ThenByDescending(r => r.Id)
            .Skip((req.Page - 1) * req.PageSize)
            .Take(req.PageSize)
            .ToListAsync(ct);

        // Resolve order codes in memory (single round-trip; no jsonb projection).
        var orderIds = pageRows.Where(r => r.OrderId != null).Select(r => r.OrderId!.Value).Distinct().ToList();
        var codes = await dbContext.Orders.AsNoTracking()
            .Where(o => orderIds.Contains(o.Id))
            .Select(o => new { o.Id, o.PublicCode })
            .ToDictionaryAsync(x => x.Id, x => x.PublicCode, ct);

        var items = pageRows
            .Select(r => new AuditEntryDto(
                r.Source,
                r.ActorUserId,
                r.Entity,
                r.Action,
                r.OrderId is Guid oid && codes.TryGetValue(oid, out var code) ? code : null,
                r.At))
            .ToList();

        await Send.OkAsync(new GetAuditResponse(items, total, req.Page, req.PageSize), ct);
    }

    /// <summary>Parses optional from/to Prague days into a UTC [start, end) window (nulls when absent).</summary>
    private static (DateTimeOffset? start, DateTimeOffset? end) ParseWindow(string? from, string? to)
    {
        DateTimeOffset? start = null;
        DateTimeOffset? end = null;

        if (!string.IsNullOrEmpty(from))
            start = ToUtc(DateOnly.ParseExact(from, "yyyy-MM-dd", CultureInfo.InvariantCulture));
        if (!string.IsNullOrEmpty(to))
            end = ToUtc(DateOnly.ParseExact(to, "yyyy-MM-dd", CultureInfo.InvariantCulture).AddDays(1));

        return (start, end);
    }

    /// <summary>Converts a Prague calendar day boundary to its UTC instant.</summary>
    private static DateTimeOffset ToUtc(DateOnly pragueDay)
    {
        var local = pragueDay.ToDateTime(TimeOnly.MinValue);
        return new DateTimeOffset(TimeZoneInfo.ConvertTimeToUtc(local, PragueZone), TimeSpan.Zero);
    }

    /// <summary>Intermediate union row shape (keyless, in-SQL only).</summary>
    private sealed class AuditRow
    {
        public required string Source { get; init; }
        public Guid? ActorUserId { get; init; }
        public required string Entity { get; init; }
        public required string Action { get; init; }
        public Guid? OrderId { get; init; }
        public DateTimeOffset At { get; init; }
        public Guid Id { get; init; }
    }
}

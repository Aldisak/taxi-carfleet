using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Infrastructure;

namespace Taxi.Api.Features.Orders.GetOrderEvents;

/// <summary>Returns the chronological event feed for an order (Dispatcher only).
/// Tenant query filter enforces fleet isolation — cross-tenant order IDs return 404.</summary>
internal sealed class GetOrderEventsEndpoint(TaxiDbContext dbContext)
    : Endpoint<GetOrderEventsRequest, GetOrderEventsResponse>
{
    private readonly OrdersFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Get("orders/{id:guid}/events");
        Description(builder => builder
            .WithName(nameof(GetOrderEventsEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.DispatcherOnly));

        Summary(s =>
        {
            s.Summary = "Get order event history";
            s.Description = "Returns all events for the order in ascending chronological order. Dispatcher/FleetAdmin only.";
            s.Responses[StatusCodes.Status200OK] = "Chronological list of order events.";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a dispatcher.";
            s.Responses[StatusCodes.Status404NotFound] = "Order not found (tenant isolation — no leak).";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(GetOrderEventsRequest req, CancellationToken ct)
    {
        // Existence check: tenant filter hides cross-tenant orders → 404.
        var orderExists = await dbContext.Orders.AsNoTracking()
            .AnyAsync(o => o.Id == req.Id, ct);

        if (!orderExists) { await Send.NotFoundAsync(ct); return; }

        // Load events first (cannot project JsonDocument in SQL), then map in memory.
        var rawEvents = await dbContext.OrderEvents.AsNoTracking()
            .Where(e => e.OrderId == req.Id)
            .OrderBy(e => e.At)
            .ThenBy(e => e.Id)
            .ToListAsync(ct);

        var events = rawEvents.Select(e => new OrderEventDto(
            e.Type.ToString(),
            e.FromStatus.HasValue ? e.FromStatus.Value.ToString() : null,
            e.ToStatus.ToString(),
            e.ActorRole.ToString(),
            e.At,
            e.Payload is not null ? e.Payload.RootElement.Clone() : null))
            .ToList();

        // Dispose the original pooled JsonDocument buffers after all clones have been taken.
        foreach (var raw in rawEvents) raw.Payload?.Dispose();

        await Send.OkAsync(new GetOrderEventsResponse(events), ct);
    }
}

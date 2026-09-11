using System.Text.Json;
using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Features.Orders.AddNote;

/// <summary>Adds a dispatcher note to an existing order without changing its status.
/// Writes a <see cref="OrderEventType.NoteAdded"/> event with FromStatus = ToStatus = current order status.</summary>
internal sealed class AddNoteEndpoint(TaxiDbContext dbContext, TimeProvider timeProvider)
    : Endpoint<AddNoteRequest>
{
    private readonly OrdersFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Post("orders/{id:guid}/notes");
        Description(builder => builder
            .WithName(nameof(AddNoteEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.DispatcherOnly));

        Summary(s =>
        {
            s.Summary = "Add a note to an order";
            s.Description = "Writes a NoteAdded event with the provided text. Does not change order status.";
            s.Responses[StatusCodes.Status204NoContent] = "Note written successfully.";
            s.Responses[StatusCodes.Status400BadRequest] = "Text is empty or exceeds 2000 characters.";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a dispatcher.";
            s.Responses[StatusCodes.Status404NotFound] = "Order not found (tenant isolation — no leak).";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(AddNoteRequest req, CancellationToken ct)
    {
        var idClaim = User.FindFirst("sub")?.Value;
        var roleClaim = User.FindFirst("role")?.Value;

        if (!Guid.TryParse(idClaim, out var actorUserId) ||
            !Enum.TryParse<UserRole>(roleClaim, out var actorRole))
        {
            await Send.NotFoundAsync(ct);
            return;
        }

        var order = await dbContext.Orders.AsNoTracking()
            .FirstOrDefaultAsync(o => o.Id == req.Id, ct);

        if (order is null) { await Send.NotFoundAsync(ct); return; }

        var payload = JsonSerializer.SerializeToDocument(new { text = req.Text });

        var noteEvent = new OrderEvent
        {
            Id = Guid.CreateVersion7(),
            FleetId = order.FleetId,
            OrderId = order.Id,
            Type = OrderEventType.NoteAdded,
            FromStatus = order.Status,
            ToStatus = order.Status,
            ActorUserId = actorUserId,
            ActorRole = actorRole,
            Payload = payload,
            At = timeProvider.GetUtcNow()
        };

        dbContext.OrderEvents.Add(noteEvent);
        await dbContext.SaveChangesAsync(ct);

        await Send.NoContentAsync(ct);
    }
}

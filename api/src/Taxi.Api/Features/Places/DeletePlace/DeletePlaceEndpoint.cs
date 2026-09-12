using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Infrastructure;

namespace Taxi.Api.Features.Places.DeletePlace;

/// <summary>Hard-deletes a place (FleetAdmin only). Places carry no referential history (unlike orders
/// and events), so a hard delete is safe. A cross-fleet id returns a no-leak 404.</summary>
internal sealed class DeletePlaceEndpoint(TaxiDbContext dbContext)
    : Endpoint<DeletePlaceRequest>
{
    private readonly PlacesFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Delete("places/{id:guid}");
        Description(builder => builder
            .WithName(nameof(DeletePlaceEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.FleetAdminOnly));

        Summary(s =>
        {
            s.Summary = "Delete a place";
            s.Description = "Hard-deletes a place. FleetAdmin only. Cross-fleet id returns 404.";
            s.Responses[StatusCodes.Status204NoContent] = "Place deleted.";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a fleet admin.";
            s.Responses[StatusCodes.Status404NotFound] = "Place not found or not in this fleet.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(DeletePlaceRequest req, CancellationToken ct)
    {
        var place = await dbContext.Places.FirstOrDefaultAsync(p => p.Id == req.Id, ct);

        if (place is null) { await Send.NotFoundAsync(ct); return; }

        dbContext.Places.Remove(place);
        await dbContext.SaveChangesAsync(ct);

        await Send.NoContentAsync(ct);
    }
}

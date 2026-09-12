using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Infrastructure;

namespace Taxi.Api.Features.Zones.DeleteZone;

/// <summary>Hard-deletes a zone (FleetAdmin only). A cross-fleet id returns a no-leak 404.</summary>
internal sealed class DeleteZoneEndpoint(TaxiDbContext dbContext)
    : Endpoint<DeleteZoneRequest>
{
    private readonly ZonesFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Delete("zones/{id:guid}");
        Description(builder => builder
            .WithName(nameof(DeleteZoneEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.FleetAdminOnly));

        Summary(s =>
        {
            s.Summary = "Delete a zone";
            s.Description = "Hard-deletes a zone. FleetAdmin only. Cross-fleet id returns 404.";
            s.Responses[StatusCodes.Status204NoContent] = "Zone deleted.";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a fleet admin.";
            s.Responses[StatusCodes.Status404NotFound] = "Zone not found or not in this fleet.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(DeleteZoneRequest req, CancellationToken ct)
    {
        var zone = await dbContext.Zones.FirstOrDefaultAsync(z => z.Id == req.Id, ct);

        if (zone is null) { await Send.NotFoundAsync(ct); return; }

        dbContext.Zones.Remove(zone);
        await dbContext.SaveChangesAsync(ct);

        await Send.NoContentAsync(ct);
    }
}

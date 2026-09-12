using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Infrastructure;

namespace Taxi.Api.Features.Routes.DeleteRoute;

/// <summary>Soft-deletes a route (FleetAdmin only) by setting <c>DeletedAt</c>. The row is never
/// hard-deleted so historical orders that reference it keep their RouteId. Cross-fleet id → 404.</summary>
internal sealed class DeleteRouteEndpoint(TaxiDbContext dbContext, TimeProvider timeProvider)
    : Endpoint<DeleteRouteRequest>
{
    private readonly RoutesFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Delete("routes/{id:guid}");
        Description(builder => builder
            .WithName(nameof(DeleteRouteEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.FleetAdminOnly));

        Summary(s =>
        {
            s.Summary = "Delete (soft) a route";
            s.Description = "Sets DeletedAt. The route row is retained. FleetAdmin only. Cross-fleet id returns 404.";
            s.Responses[StatusCodes.Status204NoContent] = "Route soft-deleted.";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a fleet admin.";
            s.Responses[StatusCodes.Status404NotFound] = "Route not found or not in this fleet.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(DeleteRouteRequest req, CancellationToken ct)
    {
        var route = await dbContext.Routes.FirstOrDefaultAsync(r => r.Id == req.Id && r.DeletedAt == null, ct);

        if (route is null) { await Send.NotFoundAsync(ct); return; }

        route.DeletedAt = timeProvider.GetUtcNow();
        await dbContext.SaveChangesAsync(ct);

        await Send.NoContentAsync(ct);
    }
}

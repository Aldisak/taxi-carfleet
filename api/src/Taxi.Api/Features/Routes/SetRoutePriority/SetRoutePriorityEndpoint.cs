using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Infrastructure;

namespace Taxi.Api.Features.Routes.SetRoutePriority;

/// <summary>Sets a route's match priority (FleetAdmin only). Cross-fleet id → 404.</summary>
internal sealed class SetRoutePriorityEndpoint(TaxiDbContext dbContext)
    : Endpoint<SetRoutePriorityRequest>
{
    private readonly RoutesFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Patch("routes/{id:guid}/priority");
        Description(builder => builder
            .WithName(nameof(SetRoutePriorityEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.FleetAdminOnly));

        Summary(s =>
        {
            s.Summary = "Set route priority";
            s.Description = "Sets the route's match priority. FleetAdmin only. Cross-fleet id returns 404.";
            s.Responses[StatusCodes.Status204NoContent] = "Route priority updated.";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a fleet admin.";
            s.Responses[StatusCodes.Status404NotFound] = "Route not found or not in this fleet.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(SetRoutePriorityRequest req, CancellationToken ct)
    {
        var route = await dbContext.Routes.FirstOrDefaultAsync(r => r.Id == req.Id && r.DeletedAt == null, ct);

        if (route is null) { await Send.NotFoundAsync(ct); return; }

        route.Priority = req.Priority;
        await dbContext.SaveChangesAsync(ct);

        await Send.NoContentAsync(ct);
    }
}

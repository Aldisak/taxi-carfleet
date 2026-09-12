using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Infrastructure;

namespace Taxi.Api.Features.Routes.SetRouteEnabled;

/// <summary>Toggles a route's IsEnabled flag (FleetAdmin only). Cross-fleet id → 404.</summary>
internal sealed class SetRouteEnabledEndpoint(TaxiDbContext dbContext)
    : Endpoint<SetRouteEnabledRequest>
{
    private readonly RoutesFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Patch("routes/{id:guid}/enable");
        Description(builder => builder
            .WithName(nameof(SetRouteEnabledEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.FleetAdminOnly));

        Summary(s =>
        {
            s.Summary = "Enable/disable a route";
            s.Description = "Toggles the route's IsEnabled flag. FleetAdmin only. Cross-fleet id returns 404.";
            s.Responses[StatusCodes.Status204NoContent] = "Route enabled state updated.";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a fleet admin.";
            s.Responses[StatusCodes.Status404NotFound] = "Route not found or not in this fleet.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(SetRouteEnabledRequest req, CancellationToken ct)
    {
        var route = await dbContext.Routes.FirstOrDefaultAsync(r => r.Id == req.Id && r.DeletedAt == null, ct);

        if (route is null) { await Send.NotFoundAsync(ct); return; }

        route.IsEnabled = req.IsEnabled;
        await dbContext.SaveChangesAsync(ct);

        await Send.NoContentAsync(ct);
    }
}

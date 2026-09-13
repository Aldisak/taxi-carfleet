using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Infrastructure;

namespace Taxi.Api.Features.Admin.DeactivateFleet;

/// <summary>SuperAdmin-only endpoint that deactivates a fleet (sets IsActive=false). Cross-tenant write:
/// the SuperAdmin scope has no fleet_id, so we stamp <c>CurrentTenant.FleetId</c> to the target fleet
/// before SaveChanges (Fleet is not an ITenantEntity so the guard does not block it, but stamping keeps
/// the scope consistent with any incidental tenant-owned modifications). Hard-guarded by SuperAdminOnly.</summary>
internal sealed class DeactivateFleetEndpoint(TaxiDbContext dbContext, CurrentTenant currentTenant)
    : EndpointWithoutRequest
{
    private readonly AdminFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Post("admin/fleets/{id:guid}/deactivate");
        Description(builder => builder
            .WithName(nameof(DeactivateFleetEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.SuperAdminOnly));

        Summary(s =>
        {
            s.Summary = "Deactivate fleet (SuperAdmin)";
            s.Description = "Sets the fleet's IsActive flag to false. SuperAdmin only.";
            s.Responses[StatusCodes.Status204NoContent] = "Fleet deactivated.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a super admin.";
            s.Responses[StatusCodes.Status404NotFound] = "Fleet not found.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(CancellationToken ct)
    {
        var id = Route<Guid>("id");

        var fleet = await dbContext.Fleets.IgnoreQueryFilters()
            .FirstOrDefaultAsync(f => f.Id == id, ct);
        if (fleet is null) { await Send.NotFoundAsync(ct); return; }

        currentTenant.FleetId = fleet.Id;
        fleet.IsActive = false;
        await dbContext.SaveChangesAsync(ct);

        await Send.NoContentAsync(ct);
    }
}

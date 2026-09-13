using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common;
using Taxi.Api.Common.Admin;
using Taxi.Api.Common.Features;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Infrastructure;

namespace Taxi.Api.Features.Admin.CreateFleet;

/// <summary>SuperAdmin-only endpoint that onboards a new fleet: creates the Fleet, seeds FleetSettings
/// defaults + a default Tariff, and creates the FleetAdmin user with a one-time password (returned once).
/// <para>This is the ONE sanctioned cross-tenant write: the SuperAdmin JWT carries no fleet_id, so the
/// request scope's tenant is null. We set <c>CurrentTenant.FleetId</c> to the NEW fleet id before
/// SaveChanges so the tenant guard stamps/permits the new tenant's rows (CLAUDE.md WI-04). Hard-guarded
/// by <see cref="AuthorizationPolicies.SuperAdminOnly"/>.</para></summary>
internal sealed class CreateFleetEndpoint(
    TaxiDbContext dbContext, CurrentTenant currentTenant, TimeProvider timeProvider)
    : Endpoint<CreateFleetRequest, CreateFleetResponse>
{
    private readonly AdminFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Post("admin/fleets");
        Description(builder => builder
            .WithName(nameof(CreateFleetEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.SuperAdminOnly));

        Summary(s =>
        {
            s.Summary = "Create fleet (SuperAdmin)";
            s.Description = "Onboards a new fleet: Fleet + FleetSettings defaults + default Tariff + " +
                            "FleetAdmin user. Returns the one-time admin password exactly once.";
            s.Responses[StatusCodes.Status201Created] = "Fleet created; response includes the one-time admin password.";
            s.Responses[StatusCodes.Status400BadRequest] = "Invalid slug/name/phone/email.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a super admin.";
            s.Responses[StatusCodes.Status409Conflict] = "A fleet with the same slug already exists.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(CreateFleetRequest req, CancellationToken ct)
    {
        // Duplicate-slug guard. IgnoreQueryFilters for safety though Fleet has no tenant filter.
        var slugTaken = await dbContext.Fleets.IgnoreQueryFilters()
            .AnyAsync(f => f.Slug == req.Slug, ct);
        if (slugTaken)
        {
            AddError(r => r.Slug, "A fleet with this slug already exists.", ErrorCodes.Admin.DuplicateSlug);
            await Send.ErrorsAsync(409, ct);
            return;
        }

        var (fleetId, oneTimePassword) = FleetProvisioning.Build(
            req.Slug, req.Name, req.Phone, req.AdminEmail, timeProvider.GetUtcNow(),
            addFleet: f => dbContext.Fleets.Add(f),
            addSettings: s => dbContext.FleetSettings.Add(s),
            addTariff: t => dbContext.Tariffs.Add(t),
            addUser: u => dbContext.Users.Add(u));

        // Sanctioned cross-tenant write: stamp the scope to the new fleet so the SaveChanges guard
        // permits the tenant-owned rows (FleetSettings, Tariff) for a fleet that is not the caller's.
        currentTenant.FleetId = fleetId;
        await dbContext.SaveChangesAsync(ct);

        Logger.LogInformation("Fleet created {FleetId} {Slug}", fleetId, req.Slug);

        await Send.CreatedAtAsync<ListFleets.ListFleetsEndpoint>(
            routeValues: null,
            new CreateFleetResponse(fleetId, req.Slug, req.AdminEmail, oneTimePassword),
            cancellation: ct);
    }
}

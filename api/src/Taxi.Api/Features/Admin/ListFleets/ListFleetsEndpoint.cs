using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Infrastructure;

namespace Taxi.Api.Features.Admin.ListFleets;

/// <summary>SuperAdmin-only endpoint listing ALL fleets across all tenants (cross-fleet by design).
/// Uses <c>IgnoreQueryFilters</c> because Fleet itself has no tenant filter but the SuperAdmin scope has
/// no fleet_id; this returns every tenant's fleet row.</summary>
internal sealed class ListFleetsEndpoint(TaxiDbContext dbContext)
    : EndpointWithoutRequest<ListFleetsResponse>
{
    private readonly AdminFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Get("admin/fleets");
        Description(builder => builder
            .WithName(nameof(ListFleetsEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.SuperAdminOnly));

        Summary(s =>
        {
            s.Summary = "List fleets (SuperAdmin)";
            s.Description = "Lists every fleet across all tenants, newest first. SuperAdmin only.";
            s.Responses[StatusCodes.Status200OK] = "All fleets.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a super admin.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(CancellationToken ct)
    {
        var fleets = await dbContext.Fleets.IgnoreQueryFilters().AsNoTracking()
            .OrderByDescending(f => f.CreatedAt)
            .Select(f => new AdminFleetDto(f.Id, f.Slug, f.Name, f.Phone, f.IsActive, f.CreatedAt))
            .ToListAsync(ct);

        await Send.OkAsync(new ListFleetsResponse(fleets), ct);
    }
}

using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Infrastructure;

namespace Taxi.Api.Features.Places.ListPlaces;

/// <summary>Lists all places in the current fleet, ordered by sort order (FleetAdmin only).</summary>
internal sealed class ListPlacesEndpoint(TaxiDbContext dbContext)
    : EndpointWithoutRequest<ListPlacesResponse>
{
    private readonly PlacesFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Get("places");
        Description(builder => builder
            .WithName(nameof(ListPlacesEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.FleetAdminOnly));

        Summary(s =>
        {
            s.Summary = "List places";
            s.Description = "Returns all places in the current fleet ordered by sort order. FleetAdmin only.";
            s.Responses[StatusCodes.Status200OK] = "List of places.";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a fleet admin.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(CancellationToken ct)
    {
        var places = await dbContext.Places.AsNoTracking()
            .OrderBy(p => p.SortOrder)
            .Select(p => new PlaceDto(p.Id, p.Name, p.Lat, p.Lng, p.Address, p.SortOrder, p.IsEnabled))
            .ToListAsync(ct);

        await Send.OkAsync(new ListPlacesResponse(places), ct);
    }
}

using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Features.Places.ListPlaces;
using Taxi.Api.Infrastructure;

namespace Taxi.Api.Features.Places.UpdatePlace;

/// <summary>Updates a place (full PUT update, FleetAdmin only). A cross-fleet id returns a no-leak 404
/// because the tenant query filter excludes other fleets' rows.</summary>
internal sealed class UpdatePlaceEndpoint(TaxiDbContext dbContext)
    : Endpoint<UpdatePlaceRequest, PlaceDto>
{
    private readonly PlacesFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Put("places/{id:guid}");
        Description(builder => builder
            .WithName(nameof(UpdatePlaceEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.FleetAdminOnly));

        Summary(s =>
        {
            s.Summary = "Update a place";
            s.Description = "Full update of a place. FleetAdmin only. Cross-fleet id returns 404.";
            s.Responses[StatusCodes.Status200OK] = "Place updated.";
            s.Responses[StatusCodes.Status400BadRequest] = "Validation error.";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a fleet admin.";
            s.Responses[StatusCodes.Status404NotFound] = "Place not found or not in this fleet.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(UpdatePlaceRequest req, CancellationToken ct)
    {
        var place = await dbContext.Places.FirstOrDefaultAsync(p => p.Id == req.Id, ct);

        if (place is null) { await Send.NotFoundAsync(ct); return; }

        place.Name = req.Name;
        place.Lat = req.Lat;
        place.Lng = req.Lng;
        place.Address = req.Address;
        place.SortOrder = req.SortOrder;
        place.IsEnabled = req.IsEnabled;

        await dbContext.SaveChangesAsync(ct);

        await Send.OkAsync(
            new PlaceDto(place.Id, place.Name, place.Lat, place.Lng, place.Address, place.SortOrder, place.IsEnabled),
            ct);
    }
}

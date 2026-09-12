using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Features.Places.CreatePlace;

/// <summary>Creates a new place in the current fleet (FleetAdmin only). The FleetId is stamped
/// from the current tenant by the DbContext guard.</summary>
internal sealed class CreatePlaceEndpoint(TaxiDbContext dbContext)
    : Endpoint<CreatePlaceRequest, CreatePlaceResponse>
{
    private readonly PlacesFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Post("places");
        Description(builder => builder
            .WithName(nameof(CreatePlaceEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.FleetAdminOnly));

        Summary(s =>
        {
            s.Summary = "Create a place";
            s.Description = "Creates a new named place in the current fleet. FleetAdmin only.";
            s.Responses[StatusCodes.Status201Created] = "Place created.";
            s.Responses[StatusCodes.Status400BadRequest] = "Validation error.";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a fleet admin.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(CreatePlaceRequest req, CancellationToken ct)
    {
        var place = new Place
        {
            Id = Guid.CreateVersion7(),
            Name = req.Name,
            Lat = req.Lat,
            Lng = req.Lng,
            Address = req.Address,
            SortOrder = req.SortOrder,
            IsEnabled = req.IsEnabled
        };
        dbContext.Places.Add(place);
        await dbContext.SaveChangesAsync(ct);

        await Send.ResponseAsync(
            new CreatePlaceResponse(
                place.Id, place.Name, place.Lat, place.Lng, place.Address, place.SortOrder, place.IsEnabled),
            StatusCodes.Status201Created,
            ct);
    }
}

using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Infrastructure.Geo;

namespace Taxi.Api.Features.Geo.Suggest;

/// <summary>Address autocomplete proxy — delegates to Photon via IGeoProvider.
/// On any upstream failure returns 200 with an empty list so the order form is never blocked.</summary>
internal sealed class SuggestEndpoint(IGeoProvider geoProvider, ILogger<SuggestEndpoint> logger)
    : Endpoint<SuggestRequest, SuggestResponse>
{
    private readonly GeoFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Get("geo/suggest");
        Description(builder => builder
            .WithName(nameof(SuggestEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.DispatcherOnly));

        Summary(s =>
        {
            s.Summary = "Address autocomplete";
            s.Description = "Proxies query to Photon address search. On upstream failure returns 200 with an empty list.";
            s.Responses[StatusCodes.Status200OK] = "List of address suggestions (may be empty).";
            s.Responses[StatusCodes.Status400BadRequest] = "Query too short (fewer than 3 characters).";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a dispatcher.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(SuggestRequest req, CancellationToken ct)
    {
        IReadOnlyList<GeoSuggestItem> results;
        try
        {
            results = await geoProvider.SuggestAsync(req.Q, ct);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Geo suggest upstream failed {Reason}", "GeoUpstreamUnavailable");
            await Send.OkAsync(new SuggestResponse([]), ct);
            return;
        }

        var items = results
            .Select(r => new SuggestItemDto(r.Label, r.Lat, r.Lng))
            .ToList();

        await Send.OkAsync(new SuggestResponse(items), ct);
    }
}

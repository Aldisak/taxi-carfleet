using System.Globalization;
using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Taxi.Api.Authorization;
using Taxi.Api.Common.Features;
using Taxi.Api.Common.Geo;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Infrastructure.Geo;

namespace Taxi.Api.Features.Geo.Suggest;

/// <summary>Address autocomplete proxy — delegates to Mapy.com via IGeoService.
/// On any upstream failure returns 200 with an empty list so the order form is never blocked.</summary>
internal sealed class SuggestEndpoint(IGeoService geoService, ICurrentTenant currentTenant, GeoRateLimiter rateLimiter, ILogger<SuggestEndpoint> logger)
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
        Policies(nameof(AuthorizationPolicies.CustomerOrStaff));

        Summary(s =>
        {
            s.Summary = "Address autocomplete";
            s.Description = "Proxies query to Mapy.com address suggest. On upstream failure returns 200 with an empty list.";
            s.Responses[StatusCodes.Status200OK] = "List of address suggestions (may be empty).";
            s.Responses[StatusCodes.Status400BadRequest] = "Query too short (fewer than 3 characters).";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a customer, dispatcher, or fleet admin.";
            s.Responses[StatusCodes.Status429TooManyRequests] = "Per-user rate limit exceeded (5 req/s).";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(SuggestRequest req, CancellationToken ct)
    {
        var subClaim = User.FindFirst("sub")?.Value;
        if (!Guid.TryParse(subClaim, out var userId) || !rateLimiter.TryAcquire(userId))
        {
            AddError(Common.ErrorCodes.Geo.RateLimited);
            await Send.ErrorsAsync(429, ct);
            return;
        }

        // Fleet is used for cache + usage scoping. Customers may have no fleet_id claim;
        // fall back to Guid.Empty so suggests are cached globally (no per-fleet cost).
        var fleetId = currentTenant.FleetId ?? Guid.Empty;

        // Parse the near hint leniently — malformed input is silently ignored (never 400).
        (double Lat, double Lng)? near = null;
        if (req.Near is { Length: > 0 } nearStr)
        {
            var parts = nearStr.Split(',');
            if (parts.Length == 2
                && double.TryParse(parts[0], NumberStyles.Float, CultureInfo.InvariantCulture, out var nearLat)
                && double.TryParse(parts[1], NumberStyles.Float, CultureInfo.InvariantCulture, out var nearLng))
            {
                near = (nearLat, nearLng);
            }
        }

        var cacheResult = await geoService.SuggestAsync(fleetId, req.Q, near, ct);

        // Set source/cache headers before writing the response body.
        HttpContext.Response.Headers.Append("X-Geo-Source", "mapy");
        HttpContext.Response.Headers.Append("X-Geo-Cache", cacheResult.WasHit ? "hit" : "miss");

        if (cacheResult.Result is GeoResult<IReadOnlyList<MapySuggestResult>>.Unavailable)
        {
            logger.LogWarning("Geo suggest upstream unavailable {Reason}", "GeoUpstreamUnavailable");
            await Send.OkAsync(new SuggestResponse([]), ct);
            return;
        }

        var items = ((GeoResult<IReadOnlyList<MapySuggestResult>>.Success)cacheResult.Result).Value
            .Select(r => new SuggestItemDto(r.Label, r.Street, r.Municipality, r.Lat, r.Lng))
            .ToList();

        await Send.OkAsync(new SuggestResponse(items), ct);
    }
}

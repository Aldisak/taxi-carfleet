using System.Globalization;
using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Taxi.Api.Authorization;
using Taxi.Api.Common;
using Taxi.Api.Common.Features;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Geo;

namespace Taxi.Api.Features.Geo.Route;

/// <summary>Route distance/duration proxy — delegates to OSRM via IGeoProvider.
/// Computes a server-side estimated price from the caller's fleet default tariff (F-03).
/// On upstream failure returns 502 with Geo.RouteUnavailable.</summary>
internal sealed class RouteEndpoint(
    IGeoProvider geoProvider,
    TaxiDbContext dbContext,
    ICurrentTenant currentTenant,
    ILogger<RouteEndpoint> logger)
    : Endpoint<RouteRequest, RouteResponse>
{
    private readonly GeoFeatureConfiguration _featureConfiguration = new();

    /// <inheritdoc />
    public override void Configure()
    {
        Get("geo/route");
        Description(builder => builder
            .WithName(nameof(RouteEndpoint))
            .WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.DispatcherOnly));

        Summary(s =>
        {
            s.Summary = "Get route distance and duration";
            s.Description = "Proxies coords to OSRM and returns distance/duration with a server-priced estimate. On failure returns 502.";
            s.Responses[StatusCodes.Status200OK] = "Distance, duration, and optional estimated price.";
            s.Responses[StatusCodes.Status400BadRequest] = "Invalid or missing coordinates.";
            s.Responses[StatusCodes.Status401Unauthorized] = "Not authenticated.";
            s.Responses[StatusCodes.Status403Forbidden] = "Not a dispatcher.";
            s.Responses[StatusCodes.Status502BadGateway] = "Upstream route unavailable.";
        });
    }

    /// <inheritdoc />
    public override async Task HandleAsync(RouteRequest req, CancellationToken ct)
    {
        // Parse coords with InvariantCulture (FastEndpoints query binding is locale-sensitive for double).
        var fromLat = double.Parse(req.FromLat!, NumberStyles.Float, CultureInfo.InvariantCulture);
        var fromLng = double.Parse(req.FromLng!, NumberStyles.Float, CultureInfo.InvariantCulture);
        var toLat = double.Parse(req.ToLat!, NumberStyles.Float, CultureInfo.InvariantCulture);
        var toLng = double.Parse(req.ToLng!, NumberStyles.Float, CultureInfo.InvariantCulture);

        GeoRouteResult routeResult;
        try
        {
            routeResult = await geoProvider.RouteAsync(fromLat, fromLng, toLat, toLng, ct);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Geo route upstream failed {Reason}", "GeoUpstreamUnavailable");
            AddError("Route upstream is unavailable.", ErrorCodes.Geo.RouteUnavailable);
            await Send.ErrorsAsync(502, ct);
            return;
        }

        int? estimatedPriceCzk = null;

        if (currentTenant.FleetId.HasValue)
        {
            var tariff = await dbContext.Tariffs.AsNoTracking()
                .Where(t => t.IsDefault && t.IsEnabled)
                .Select(t => new { t.BaseFareCzk, t.PerKmCzk, t.MinimumFareCzk })
                .FirstOrDefaultAsync(ct);

            if (tariff is not null)
            {
                var distanceKm = routeResult.DistanceMeters / 1000.0;
                estimatedPriceCzk = Math.Max(tariff.MinimumFareCzk,
                    (int)Math.Round(tariff.BaseFareCzk + tariff.PerKmCzk * distanceKm));
            }
        }

        await Send.OkAsync(new RouteResponse(routeResult.DistanceMeters, routeResult.DurationSeconds, estimatedPriceCzk), ct);
    }
}

using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Common.Features;
using Taxi.Api.Infrastructure.Geo;

namespace Taxi.Api.Features.Geo;

/// <summary>Feature configuration for the Geo proxy slice.
/// Registers named HttpClients for Photon (suggest) and OSRM (route), and the IGeoProvider singleton.</summary>
internal sealed class GeoFeatureConfiguration : IFeatureConfiguration
{
    /// <summary>Swagger tag info for the Geo feature.</summary>
    public FeatureInfo Info => new("Geo", "Address autocomplete and route distance/duration proxy endpoints");

    /// <summary>Registers the named HttpClients and IGeoProvider implementation.</summary>
    public IServiceCollection AddFeatureDependencies(IServiceCollection services, IConfiguration configuration)
    {
        var suggestBaseUrl = configuration["Geo:SuggestBaseUrl"] ?? "https://photon.komoot.io/";
        var routeBaseUrl = configuration["Geo:RouteBaseUrl"] ?? "https://router.project-osrm.org/";

        services.AddHttpClient("photon", client =>
        {
            client.BaseAddress = new Uri(suggestBaseUrl);
            client.Timeout = TimeSpan.FromSeconds(4);
        });

        services.AddHttpClient("osrm", client =>
        {
            client.BaseAddress = new Uri(routeBaseUrl);
            client.Timeout = TimeSpan.FromSeconds(4);
        });

        services.AddSingleton<IGeoProvider, PhotonOsrmGeoProvider>();

        return services;
    }
}

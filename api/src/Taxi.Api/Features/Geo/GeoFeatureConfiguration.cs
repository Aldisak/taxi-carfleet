using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Common.Features;
using Taxi.Api.Common.Geo;
using Taxi.Api.Common.Security;
using Taxi.Api.Infrastructure.Geo;

namespace Taxi.Api.Features.Geo;

/// <summary>Feature configuration for the Geo proxy slice.
/// Registers the Mapy.com typed HttpClient with its resilience pipeline, the two-tier GeoCache,
/// GeoUsageRecorder, and the high-level IGeoService orchestration layer.</summary>
internal sealed class GeoFeatureConfiguration : IFeatureConfiguration
{
    /// <summary>Swagger tag info for the Geo feature.</summary>
    public FeatureInfo Info => new("Geo", "Address autocomplete and route distance/duration proxy endpoints");

    /// <summary>Registers the Mapy typed client, IGeoService, GeoCache, and GeoUsageRecorder.</summary>
    public IServiceCollection AddFeatureDependencies(IServiceCollection services, IConfiguration configuration)
    {
        // Mapy.com typed HttpClient with resilience pipeline.
        var mapyBaseUrl = configuration["Mapy:BaseUrl"] ?? "https://api.mapy.cz/";
        services.AddHttpClient<MapyClient>(client =>
            {
                client.BaseAddress = new Uri(mapyBaseUrl);
            })
            .AddMapyResilienceHandler();

        services.AddSingleton<IMapyClient>(sp => sp.GetRequiredService<MapyClient>());
        services.AddSingleton<MapyKeyResolver>();

        // Per-user token-bucket rate limiter (singleton — shared across all requests).
        services.AddSingleton<GeoRateLimiter>();

        // L1 cache (singleton — survives across scopes in the same process).
        services.AddMemoryCache();

        // Budget alert service (Scoped — injected into GeoUsageRecorder; opens its own inner scope for tenant isolation).
        services.AddScoped<GeoBudgetAlertService>();

        // L2 cache + usage recorder (both Scoped — depend on scoped TaxiDbContext).
        services.AddScoped<GeoUsageRecorder>();
        services.AddScoped<GeoCache>();

        // High-level orchestration (Scoped because it depends on GeoCache which is Scoped).
        services.AddScoped<IGeoService, GeoService>();

        return services;
    }
}

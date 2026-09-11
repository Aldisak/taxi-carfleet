using Taxi.Api.Common.Features;

namespace Taxi.Api.Features.Health;

/// <summary>Feature configuration for the Health slice.</summary>
internal sealed class HealthFeatureConfiguration : IFeatureConfiguration
{
    /// <summary>Swagger tag info for this feature.</summary>
    public FeatureInfo Info => new("Health", "API health and liveness endpoints");

    /// <summary>No feature-scoped services for the health slice.</summary>
    /// <param name="services">The service collection.</param>
    /// <param name="configuration">The application configuration.</param>
    /// <returns>The unchanged service collection.</returns>
    public IServiceCollection AddFeatureDependencies(IServiceCollection services, IConfiguration configuration) =>
        services;
}

namespace Taxi.Api.Common.Features;

/// <summary>
/// Marker interface implemented by every feature slice's configuration class.
/// Auto-discovered via reflection on startup — no manual registration required.
/// </summary>
public interface IFeatureConfiguration
{
    /// <summary>Swagger tag info for this feature.</summary>
    FeatureInfo Info { get; }

    /// <summary>Register feature-scoped services here.</summary>
    /// <param name="services">The service collection to register into.</param>
    /// <param name="configuration">The application configuration.</param>
    /// <returns>The same service collection for chaining.</returns>
    IServiceCollection AddFeatureDependencies(IServiceCollection services, IConfiguration configuration);
}

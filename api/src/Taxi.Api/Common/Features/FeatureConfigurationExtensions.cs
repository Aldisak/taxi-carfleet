using System.Reflection;

namespace Taxi.Api.Common.Features;

/// <summary>Extension methods for auto-discovering and registering feature configurations.</summary>
internal static class FeatureConfigurationExtensions
{
    /// <summary>
    /// Scans all types in the executing assembly that implement <see cref="IFeatureConfiguration"/>
    /// and calls <see cref="IFeatureConfiguration.AddFeatureDependencies"/> on each.
    /// Types must have a public parameterless constructor.
    /// </summary>
    /// <param name="services">The service collection to register into.</param>
    /// <param name="configuration">The application configuration.</param>
    /// <returns>The same service collection for chaining.</returns>
    internal static IServiceCollection AddFeatureConfigurations(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var featureConfigTypes = Assembly.GetExecutingAssembly()
            .GetTypes()
            .Where(t =>
                t is { IsClass: true, IsAbstract: false } &&
                typeof(IFeatureConfiguration).IsAssignableFrom(t) &&
                t.GetConstructor(Type.EmptyTypes) is not null);

        foreach (var type in featureConfigTypes)
        {
            var instance = (IFeatureConfiguration)Activator.CreateInstance(type)!;
            instance.AddFeatureDependencies(services, configuration);
        }

        return services;
    }
}

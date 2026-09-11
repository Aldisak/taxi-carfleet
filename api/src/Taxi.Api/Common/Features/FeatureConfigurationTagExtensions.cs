namespace Taxi.Api.Common.Features;

/// <summary>Extension methods for applying feature configuration Swagger tags to endpoints.</summary>
internal static class FeatureConfigurationTagExtensions
{
    /// <summary>
    /// Adds the feature's Swagger tag to the endpoint description.
    /// Call this inside <c>Description(builder => builder.WithTag(_featureConfiguration))</c>.
    /// </summary>
    /// <param name="builder">The route handler builder from FastEndpoints Description().</param>
    /// <param name="featureConfiguration">The feature configuration providing the tag name.</param>
    /// <returns>The same builder for chaining.</returns>
    internal static RouteHandlerBuilder WithTag(
        this RouteHandlerBuilder builder,
        IFeatureConfiguration featureConfiguration) =>
        builder.WithTags(featureConfiguration.Info.Name);
}

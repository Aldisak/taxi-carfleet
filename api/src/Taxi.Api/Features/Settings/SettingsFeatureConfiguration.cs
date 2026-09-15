using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Common.Features;

namespace Taxi.Api.Features.Settings;

/// <summary>Feature configuration for the Settings slice.
/// Exposes fleet-level operational settings endpoints, including geo usage and budget information.</summary>
internal sealed class SettingsFeatureConfiguration : IFeatureConfiguration
{
    /// <summary>Swagger tag info for the Settings feature.</summary>
    public FeatureInfo Info => new("Settings", "Fleet operational settings and usage metrics");

    /// <summary>No feature-scoped services required beyond the default DI registrations.</summary>
    public IServiceCollection AddFeatureDependencies(IServiceCollection services, IConfiguration configuration)
        => services;
}

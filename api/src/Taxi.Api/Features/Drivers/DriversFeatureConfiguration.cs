using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Common.Features;

namespace Taxi.Api.Features.Drivers;

/// <summary>Feature configuration for the Drivers slice. Registers the Swagger tag
/// and any feature-scoped services needed by driver endpoints.</summary>
internal sealed class DriversFeatureConfiguration : IFeatureConfiguration
{
    /// <summary>Swagger tag info for the Drivers feature.</summary>
    public FeatureInfo Info => new("Drivers", "Driver list, go-online/offline, and self-view endpoints");

    /// <summary>Register feature-scoped services here.</summary>
    public IServiceCollection AddFeatureDependencies(IServiceCollection services, IConfiguration configuration)
        => services;
}

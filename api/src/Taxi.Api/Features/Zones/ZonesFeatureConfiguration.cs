using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Common.Features;

namespace Taxi.Api.Features.Zones;

/// <summary>Feature configuration for the Zones slice — geographical zone CRUD (FleetAdmin).</summary>
internal sealed class ZonesFeatureConfiguration : IFeatureConfiguration
{
    /// <summary>Swagger tag info for the Zones feature.</summary>
    public FeatureInfo Info => new("Zones", "Zone CRUD endpoints (FleetAdmin only)");

    /// <summary>Register feature-scoped services here.</summary>
    public IServiceCollection AddFeatureDependencies(IServiceCollection services, IConfiguration configuration)
        => services;
}

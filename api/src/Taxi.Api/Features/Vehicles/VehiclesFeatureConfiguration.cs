using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Common.Features;

namespace Taxi.Api.Features.Vehicles;

/// <summary>Feature configuration for the Vehicles slice. Registers the Swagger tag
/// and any feature-scoped services needed by vehicle endpoints.</summary>
internal sealed class VehiclesFeatureConfiguration : IFeatureConfiguration
{
    /// <summary>Swagger tag info for the Vehicles feature.</summary>
    public FeatureInfo Info => new("Vehicles", "Vehicle CRUD endpoints (FleetAdmin only)");

    /// <summary>Register feature-scoped services here.</summary>
    public IServiceCollection AddFeatureDependencies(IServiceCollection services, IConfiguration configuration)
        => services;
}

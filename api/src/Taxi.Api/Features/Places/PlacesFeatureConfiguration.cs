using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Common.Features;

namespace Taxi.Api.Features.Places;

/// <summary>Feature configuration for the Places slice — named points of interest CRUD (FleetAdmin).</summary>
internal sealed class PlacesFeatureConfiguration : IFeatureConfiguration
{
    /// <summary>Swagger tag info for the Places feature.</summary>
    public FeatureInfo Info => new("Places", "Named place CRUD endpoints (FleetAdmin only)");

    /// <summary>Register feature-scoped services here.</summary>
    public IServiceCollection AddFeatureDependencies(IServiceCollection services, IConfiguration configuration)
        => services;
}

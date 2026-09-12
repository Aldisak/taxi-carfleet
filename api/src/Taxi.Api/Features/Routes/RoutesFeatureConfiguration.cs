using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Common.Features;

namespace Taxi.Api.Features.Routes;

/// <summary>Feature configuration for the Routes slice — the customer common-routes listing.</summary>
internal sealed class RoutesFeatureConfiguration : IFeatureConfiguration
{
    /// <summary>Swagger tag info for the Routes feature.</summary>
    public FeatureInfo Info => new("Routes", "Customer-facing common route cards (valid-now fixed-price routes)");

    /// <summary>Register feature-scoped services here.</summary>
    public IServiceCollection AddFeatureDependencies(IServiceCollection services, IConfiguration configuration)
        => services;
}

using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Common.Features;

namespace Taxi.Api.Features.Customers;

/// <summary>Feature configuration for the Customers slice (self-service, GDPR).</summary>
internal sealed class CustomersFeatureConfiguration : IFeatureConfiguration
{
    /// <summary>Swagger tag info for this feature.</summary>
    public FeatureInfo Info => new("Customers", "Customer self-service and GDPR");

    /// <summary>Register feature-scoped services here.</summary>
    public IServiceCollection AddFeatureDependencies(IServiceCollection services, IConfiguration configuration)
        => services;
}

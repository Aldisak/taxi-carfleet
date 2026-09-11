using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Common.Features;

namespace Taxi.Api.Features.Orders;

/// <summary>Feature configuration for the Orders slice. Registers the Swagger tag
/// and any feature-scoped services needed by orders endpoints.</summary>
internal sealed class OrdersFeatureConfiguration : IFeatureConfiguration
{
    /// <summary>Swagger tag info for the Orders feature.</summary>
    public FeatureInfo Info => new("Orders", "Order create, list, and detail endpoints");

    /// <summary>Register feature-scoped services here.</summary>
    public IServiceCollection AddFeatureDependencies(IServiceCollection services, IConfiguration configuration)
        => services;
}

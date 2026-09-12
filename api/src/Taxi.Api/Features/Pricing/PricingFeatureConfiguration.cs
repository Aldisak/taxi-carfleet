using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Common.Features;

namespace Taxi.Api.Features.Pricing;

/// <summary>Feature configuration for the Pricing slice — the customer price-quote endpoint.</summary>
internal sealed class PricingFeatureConfiguration : IFeatureConfiguration
{
    /// <summary>Swagger tag info for the Pricing feature.</summary>
    public FeatureInfo Info => new("Pricing", "Customer-facing price quote (fixed price or estimate range)");

    /// <summary>Register feature-scoped services here.</summary>
    public IServiceCollection AddFeatureDependencies(IServiceCollection services, IConfiguration configuration)
        => services;
}

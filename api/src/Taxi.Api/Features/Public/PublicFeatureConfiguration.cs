using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Common.Features;

namespace Taxi.Api.Features.Public;

/// <summary>Feature configuration for the Public slice — anonymous, fleet-scoped endpoints
/// used by the customer PWA before login (branding, SMS tracking link).</summary>
internal sealed class PublicFeatureConfiguration : IFeatureConfiguration
{
    /// <summary>Swagger tag info for the Public feature.</summary>
    public FeatureInfo Info => new("Public", "Anonymous fleet-scoped endpoints (branding, tracking link)");

    /// <summary>Register feature-scoped services here.</summary>
    public IServiceCollection AddFeatureDependencies(IServiceCollection services, IConfiguration configuration)
        => services;
}

using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Common.Features;

namespace Taxi.Api.Features.Admin;

/// <summary>Feature configuration for the Admin slice (SuperAdmin fleet onboarding).</summary>
internal sealed class AdminFeatureConfiguration : IFeatureConfiguration
{
    /// <summary>Swagger tag info for this feature.</summary>
    public FeatureInfo Info => new("Admin", "SuperAdmin fleet onboarding");

    /// <summary>Register feature-scoped services here.</summary>
    public IServiceCollection AddFeatureDependencies(IServiceCollection services, IConfiguration configuration)
        => services;
}

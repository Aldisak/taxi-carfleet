using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Common.Features;

namespace Taxi.Api.Features.Audit;

/// <summary>Feature configuration for the Audit slice (unified read-only audit timeline).</summary>
internal sealed class AuditFeatureConfiguration : IFeatureConfiguration
{
    /// <summary>Swagger tag info for this feature.</summary>
    public FeatureInfo Info => new("Audit", "Unified read-only audit timeline");

    /// <summary>Register feature-scoped services here.</summary>
    public IServiceCollection AddFeatureDependencies(IServiceCollection services, IConfiguration configuration)
        => services;
}

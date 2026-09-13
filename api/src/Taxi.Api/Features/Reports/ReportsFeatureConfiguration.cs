using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Common.Features;

namespace Taxi.Api.Features.Reports;

/// <summary>Feature configuration for the Reports slice (driver report, fleet report, ratings).</summary>
internal sealed class ReportsFeatureConfiguration : IFeatureConfiguration
{
    /// <summary>Swagger tag info for this feature.</summary>
    public FeatureInfo Info => new("Reports", "Driver and fleet reports, CSV export, and ratings");

    /// <summary>Register feature-scoped services here.</summary>
    public IServiceCollection AddFeatureDependencies(IServiceCollection services, IConfiguration configuration)
        => services;
}

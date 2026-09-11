using Taxi.Api.Common.Auth;
using Taxi.Api.Common.Features;
using Taxi.Api.Infrastructure.Sms;

namespace Taxi.Api.Features.Auth;

/// <summary>Feature configuration for the Auth slice.</summary>
internal sealed class AuthFeatureConfiguration : IFeatureConfiguration
{
    /// <summary>Swagger tag info for this feature.</summary>
    public FeatureInfo Info => new("Auth", "Authentication: staff login, token refresh, logout, and customer SMS-code login");

    /// <summary>Registers <see cref="JwtIssuer"/> and <see cref="ConsoleSmsSender"/> as scoped services.
    /// <see cref="ConsoleSmsSender"/> is registered unconditionally — no production SMS gateway exists in v1;
    /// the spec scope is "SMS/push sending — interfaces only."</summary>
    /// <param name="services">The service collection.</param>
    /// <param name="configuration">The application configuration.</param>
    /// <returns>The updated service collection.</returns>
    public IServiceCollection AddFeatureDependencies(IServiceCollection services, IConfiguration configuration)
    {
        services.AddScoped<JwtIssuer>();
        services.AddSingleton<ISmsSender, ConsoleSmsSender>();
        return services;
    }
}

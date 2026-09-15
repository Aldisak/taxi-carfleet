using Taxi.Api.Common.Auth;
using Taxi.Api.Common.Features;
using Taxi.Api.Infrastructure.Sms;

namespace Taxi.Api.Features.Auth;

/// <summary>Feature configuration for the Auth slice.</summary>
internal sealed class AuthFeatureConfiguration : IFeatureConfiguration
{
    /// <summary>Swagger tag info for this feature.</summary>
    public FeatureInfo Info => new("Auth", "Authentication: staff login, token refresh, logout, and customer SMS-code login");

    /// <summary>Registers <see cref="JwtIssuer"/> as a scoped service and <see cref="ISmsSender"/> as a singleton.
    /// The <see cref="ISmsSender"/> implementation is selected by the <c>Sms:DevLogCode</c> configuration flag:
    /// when <c>true</c>, <see cref="DevConsoleSmsSender"/> is registered (logs the full OTP body to the console
    /// for local development); otherwise the masked <see cref="ConsoleSmsSender"/> is registered (default).</summary>
    /// <param name="services">The service collection.</param>
    /// <param name="configuration">The application configuration.</param>
    /// <returns>The updated service collection.</returns>
    public IServiceCollection AddFeatureDependencies(IServiceCollection services, IConfiguration configuration)
    {
        services.AddScoped<JwtIssuer>();
        services.AddSingleton<ISmsSender>(sp =>
            configuration.GetValue<bool>("Sms:DevLogCode")
                ? new DevConsoleSmsSender(
                    sp.GetRequiredService<ILogger<DevConsoleSmsSender>>(),
                    sp.GetRequiredService<IHostEnvironment>())
                : new ConsoleSmsSender(
                    sp.GetRequiredService<ILogger<ConsoleSmsSender>>()));
        return services;
    }
}

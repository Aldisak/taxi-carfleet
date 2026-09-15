using Microsoft.Extensions.Hosting;

namespace Taxi.Api.Common.Security;

/// <summary>Hosted service that validates the Data Protection key ring configuration at startup.
/// In non-Development environments, the application will fail fast if
/// <c>DataProtection:KeysDirectory</c> is not configured or the configured directory does not exist,
/// because an ephemeral key ring makes persisted fleet Mapy keys permanently undecryptable on restart.</summary>
internal sealed class DataProtectionKeyRingGuard(
    IConfiguration configuration,
    IHostEnvironment environment,
    ILogger<DataProtectionKeyRingGuard> logger) : IHostedService
{
    /// <inheritdoc />
    public Task StartAsync(CancellationToken cancellationToken)
    {
        if (environment.IsDevelopment())
        {
            // Development: a local default directory is acceptable.
            logger.LogDebug("DataProtection key ring guard skipped in Development");
            return Task.CompletedTask;
        }

        var rawKeysDir = configuration["DataProtection:KeysDirectory"];

        if (string.IsNullOrWhiteSpace(rawKeysDir))
        {
            throw new InvalidOperationException(
                "DataProtection:KeysDirectory is not configured. " +
                "In non-Development environments a persistent directory must be mounted and configured " +
                "so that fleet Mapy API keys survive restarts. " +
                "Set DataProtection:KeysDirectory to a writable, persistent path.");
        }

        if (!Directory.Exists(rawKeysDir))
        {
            throw new InvalidOperationException(
                $"DataProtection:KeysDirectory '{rawKeysDir}' does not exist. " +
                "Ensure the persistent volume is mounted before the application starts.");
        }

        logger.LogDebug("DataProtection key ring directory verified {KeysDirectory}", rawKeysDir);
        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}

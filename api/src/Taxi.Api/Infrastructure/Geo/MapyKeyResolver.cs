using Microsoft.Extensions.Configuration;
using Taxi.Api.Common.Security;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Infrastructure.Geo;

/// <summary>Resolves the Mapy.com server API key for a fleet.
/// Resolution order: (1) fleet's encrypted MapyServerKey column (decrypted via IFleetKeyProtector);
/// (2) environment/config fallback Mapy__ServerKey. The key is never logged.</summary>
internal sealed class MapyKeyResolver(IFleetKeyProtector keyProtector, IConfiguration configuration)
{
    /// <summary>Returns the server key to use for the given fleet settings, or the env fallback if no fleet key is configured.</summary>
    /// <param name="fleetSettings">Optional fleet settings row; may be null.</param>
    /// <returns>The resolved server key, or null if no key is available at all.</returns>
    public string? Resolve(FleetSettings? fleetSettings)
    {
        if (fleetSettings?.MapyServerKey is { } ciphertext && !string.IsNullOrWhiteSpace(ciphertext))
        {
            var plain = keyProtector.Unprotect(ciphertext);
            if (!string.IsNullOrWhiteSpace(plain))
                return plain;
        }

        return configuration["Mapy__ServerKey"];
    }
}

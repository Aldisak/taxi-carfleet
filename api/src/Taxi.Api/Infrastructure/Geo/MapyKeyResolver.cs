using Taxi.Api.Common.Security;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Infrastructure.Geo;

/// <summary>Resolves the Mapy.com server API key for a fleet.
/// Resolution order: (1) fleet's encrypted MapyServerKey column (decrypted via IFleetKeyProtector);
/// (2) environment/config fallback. The env var is <c>Mapy__ServerKey</c>, which .NET's
/// environment-variable provider stores under the config key <c>Mapy:ServerKey</c> (it replaces
/// <c>__</c> with <c>:</c>) — so the read MUST use the colon form, not the literal double-underscore.
/// The key is never logged.</summary>
internal sealed class MapyKeyResolver(IFleetKeyProtector keyProtector, IConfiguration configuration)
{
    /// <summary>Returns the server key to use for the given fleet settings, or the env fallback if no fleet key is configured.</summary>
    /// <param name="fleetSettings">Optional fleet settings row; may be null.</param>
    /// <returns>The resolved server key, or null if no key is available at all.</returns>
    public string? Resolve(FleetSettings? fleetSettings)
    {
        if (fleetSettings?.MapyServerKey is { } ciphertext && !string.IsNullOrWhiteSpace(ciphertext))
        {
            // TryUnprotect is used so a raw/legacy stored value falls back gracefully to config
            // instead of throwing CryptographicException (AC#4, F5 design-review finding).
            var plain = keyProtector.TryUnprotect(ciphertext);
            if (!string.IsNullOrWhiteSpace(plain))
                return plain;
        }

        return configuration["Mapy:ServerKey"];
    }
}

using Microsoft.AspNetCore.DataProtection;

namespace Taxi.Api.Common.Security;

/// <summary>Protects fleet API keys at rest using ASP.NET Core Data Protection.
/// A fixed purpose string <c>FleetSettings.MapyKeys</c> ensures keys are scoped to this use-case
/// and cannot be cross-decrypted by protectors with different purposes.</summary>
internal sealed class FleetKeyProtector : IFleetKeyProtector
{
    private const string Purpose = "FleetSettings.MapyKeys";

    private readonly IDataProtector _protector;

    /// <summary>Initialises a new <see cref="FleetKeyProtector"/> using the supplied provider.</summary>
    /// <param name="provider">The application data-protection provider.</param>
    public FleetKeyProtector(IDataProtectionProvider provider)
    {
        _protector = provider.CreateProtector(Purpose);
    }

    /// <inheritdoc />
    public string Protect(string plaintext) => _protector.Protect(plaintext);

    /// <inheritdoc />
    public string? Unprotect(string? ciphertext)
    {
        if (string.IsNullOrEmpty(ciphertext))
            return null;

        return _protector.Unprotect(ciphertext);
    }
}

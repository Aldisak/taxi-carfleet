namespace Taxi.Api.Common.Security;

/// <summary>Provides encryption and decryption of fleet API keys stored in the database.
/// Implementations use ASP.NET Core Data Protection so the key ring is external and persistent.</summary>
internal interface IFleetKeyProtector
{
    /// <summary>Encrypts <paramref name="plaintext"/> and returns a base64-encoded ciphertext.</summary>
    /// <param name="plaintext">The plaintext value to protect.</param>
    /// <returns>A base64url-encoded ciphertext string.</returns>
    string Protect(string plaintext);

    /// <summary>Decrypts <paramref name="ciphertext"/> and returns the original plaintext,
    /// or <see langword="null"/> when <paramref name="ciphertext"/> is null or empty.</summary>
    /// <param name="ciphertext">The base64url-encoded ciphertext to unprotect, or <see langword="null"/>.</param>
    /// <returns>The decrypted plaintext, or <see langword="null"/> if <paramref name="ciphertext"/> was null or empty.</returns>
    string? Unprotect(string? ciphertext);
}

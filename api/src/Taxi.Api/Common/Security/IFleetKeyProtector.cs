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

    /// <summary>Attempts to decrypt <paramref name="ciphertext"/> and returns the plaintext on success,
    /// or <see langword="null"/> on null/empty input or if decryption fails (e.g. a raw/legacy value
    /// that was never encrypted). Does not throw <see cref="System.Security.Cryptography.CryptographicException"/>.</summary>
    /// <param name="ciphertext">The base64url-encoded ciphertext to unprotect, or <see langword="null"/>.</param>
    /// <returns>The decrypted plaintext, or <see langword="null"/> if the input is null/empty or undecryptable.</returns>
    string? TryUnprotect(string? ciphertext);
}

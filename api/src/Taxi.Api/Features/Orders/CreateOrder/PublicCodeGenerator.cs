using System.Security.Cryptography;

namespace Taxi.Api.Features.Orders.CreateOrder;

/// <summary>Generates human-readable 6-character public codes for orders.
/// Uses an unambiguous charset (A-Z excluding I/O, digits 2-9) to avoid confusion
/// between visually similar characters (1/I, 0/O).</summary>
internal static class PublicCodeGenerator
{
    // Unambiguous charset: A-Z minus I and O (easily confused with 1 and 0), plus 2-9 (no 0/1).
    private const string Charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private const int CodeLength = 6;

    /// <summary>Generates a random 6-character public code from the unambiguous charset.</summary>
    public static string Generate()
    {
        Span<char> code = stackalloc char[CodeLength];
        for (var i = 0; i < CodeLength; i++)
        {
            // Cryptographically random index into the charset.
            code[i] = Charset[RandomNumberGenerator.GetInt32(Charset.Length)];
        }

        return new string(code);
    }
}

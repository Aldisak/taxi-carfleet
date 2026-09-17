using FluentAssertions;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Taxi.Api.Common.Security;
using Taxi.Api.Infrastructure.Entities;
using Taxi.Api.Infrastructure.Geo;

namespace Taxi.Api.Tests.Geo;

/// <summary>Unit tests for <see cref="MapyKeyResolver"/> — verifies the key resolution fallback
/// chain and resilience against raw/undecryptable stored values.</summary>
public sealed class MapyKeyResolverTests
{
    private const string ConfigServerKey = "config-server-key-fallback";

    /// <summary>When FleetSettings contains a valid encrypted server key, it is decrypted and returned.</summary>
    [Fact]
    public void Resolve_ValidEncryptedServerKey_ReturnsDecryptedValue()
    {
        // Arrange
        var dir = Path.Combine(Path.GetTempPath(), "taxi-resolver-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        try
        {
            var (resolver, protector, _) = BuildResolver(dir, ConfigServerKey);
            const string plaintext = "my-fleet-server-key";
            var ciphertext = protector.Protect(plaintext);
            var settings = new FleetSettings { FleetId = Guid.NewGuid(), MapyServerKey = ciphertext };

            // Act
            var result = resolver.Resolve(settings);

            // Assert
            result.Should().Be(plaintext, "a valid encrypted server key must be decrypted and returned");
        }
        finally
        {
            Directory.Delete(dir, recursive: true);
        }
    }

    /// <summary>When FleetSettings has no server key, falls back to configuration["Mapy:ServerKey"].</summary>
    [Fact]
    public void Resolve_NullServerKey_FallsBackToConfig()
    {
        // Arrange
        var dir = Path.Combine(Path.GetTempPath(), "taxi-resolver-null-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        try
        {
            var (resolver, _, _) = BuildResolver(dir, ConfigServerKey);
            var settings = new FleetSettings { FleetId = Guid.NewGuid(), MapyServerKey = null };

            // Act
            var result = resolver.Resolve(settings);

            // Assert
            result.Should().Be(ConfigServerKey, "null server key must fall back to config");
        }
        finally
        {
            Directory.Delete(dir, recursive: true);
        }
    }

    /// <summary>F5 design-review finding: a raw (non-ciphertext) stored value must not throw;
    /// it falls back to configuration["Mapy:ServerKey"] instead of CryptographicException.</summary>
    [Fact]
    public void Resolve_RawNonCiphertextServerKey_FallsBackToConfig()
    {
        // Arrange
        var dir = Path.Combine(Path.GetTempPath(), "taxi-resolver-raw-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        try
        {
            var (resolver, _, _) = BuildResolver(dir, ConfigServerKey);
            // A raw value that looks like a real API key but is not a Data Protection ciphertext.
            var settings = new FleetSettings
            {
                FleetId = Guid.NewGuid(),
                MapyServerKey = "Z8Bbu1ZRQQbe6SwQceTtx-7B9qqJptwO32s3Xaz6nxY"
            };

            // Act
            var act = () => resolver.Resolve(settings);

            // Assert: must not throw CryptographicException; returns config fallback.
            act.Should().NotThrow("a raw non-ciphertext value must not throw — TryUnprotect returns null, falling back to config");
            var result = resolver.Resolve(settings);
            result.Should().Be(ConfigServerKey, "raw value → TryUnprotect returns null → fallback to config");
        }
        finally
        {
            Directory.Delete(dir, recursive: true);
        }
    }

    /// <summary>When FleetSettings is null, falls back to configuration["Mapy:ServerKey"].</summary>
    [Fact]
    public void Resolve_NullFleetSettings_FallsBackToConfig()
    {
        // Arrange
        var dir = Path.Combine(Path.GetTempPath(), "taxi-resolver-noset-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        try
        {
            var (resolver, _, _) = BuildResolver(dir, ConfigServerKey);

            // Act
            var result = resolver.Resolve(null);

            // Assert
            result.Should().Be(ConfigServerKey, "null settings must fall back to config");
        }
        finally
        {
            Directory.Delete(dir, recursive: true);
        }
    }

    // ── helpers ───────────────────────────────────────────────────────────────────

    private static (MapyKeyResolver Resolver, IFleetKeyProtector Protector, IConfiguration Config) BuildResolver(
        string keysDir, string configServerKey)
    {
        var services = new ServiceCollection();
        services.AddDataProtection()
            .PersistKeysToFileSystem(new DirectoryInfo(keysDir))
            .SetApplicationName("taxi");
        services.AddSingleton<IFleetKeyProtector, FleetKeyProtector>();
        var provider = services.BuildServiceProvider();

        var protector = provider.GetRequiredService<IFleetKeyProtector>();
        // .NET's environment-variable provider stores the `Mapy__ServerKey` env var under the
        // config key `Mapy:ServerKey` (it replaces `__` with `:`). Mirror that normalized colon
        // form here so this unit test exercises the real production key form — using the literal
        // `Mapy__ServerKey` here would mask a resolver that reads the wrong (double-underscore) key.
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Mapy:ServerKey"] = configServerKey
            })
            .Build();

        var resolver = new MapyKeyResolver(protector, config);
        return (resolver, protector, config);
    }
}

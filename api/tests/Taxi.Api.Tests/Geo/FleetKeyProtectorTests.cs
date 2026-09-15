using FluentAssertions;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Taxi.Api.Common.Security;

namespace Taxi.Api.Tests.Geo;

/// <summary>Unit and integration tests for <see cref="IFleetKeyProtector"/> and the
/// <see cref="DataProtectionKeyRingGuard"/> fail-fast startup check.</summary>
public sealed class FleetKeyProtectorTests
{
    /// <summary>Protecting a plaintext value and then unprotecting the result returns the original value.</summary>
    [Fact]
    public void Protect_ThenUnprotect_RoundTripsPlaintext()
    {
        // Arrange
        var dir = Path.Combine(Path.GetTempPath(), "taxi-dp-test-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        try
        {
            using var services = BuildServices(dir);
            var protector = services.GetRequiredService<IFleetKeyProtector>();
            const string plaintext = "secret-mapy-api-key-12345";

            // Act
            var ciphertext = protector.Protect(plaintext);
            var result = protector.Unprotect(ciphertext);

            // Assert
            ciphertext.Should().NotBeNullOrEmpty();
            ciphertext.Should().NotBe(plaintext, "ciphertext must not equal plaintext");
            result.Should().Be(plaintext);
        }
        finally
        {
            Directory.Delete(dir, recursive: true);
        }
    }

    /// <summary>A value protected by a protector that persists keys to disk can be unprotected
    /// by a fresh protector built over the same key ring directory (simulating a restart).</summary>
    [Fact]
    public void Unprotect_WithPersistedRing_SurvivesSimulatedRestart()
    {
        // Arrange
        var dir = Path.Combine(Path.GetTempPath(), "taxi-dp-restart-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        try
        {
            const string plaintext = "mapy-server-key-restart-test";

            // Act: Protect with the first provider instance (simulating initial deployment).
            string ciphertext;
            using (var services1 = BuildServices(dir))
            {
                var protector1 = services1.GetRequiredService<IFleetKeyProtector>();
                ciphertext = protector1.Protect(plaintext);
            }

            // Act: Unprotect with a NEW provider built over the same dir (simulating restart).
            using var services2 = BuildServices(dir);
            var protector2 = services2.GetRequiredService<IFleetKeyProtector>();
            var result = protector2.Unprotect(ciphertext);

            // Assert
            result.Should().Be(plaintext, "a persisted key ring must survive a simulated restart");
        }
        finally
        {
            Directory.Delete(dir, recursive: true);
        }
    }

    /// <summary>In a non-Development environment, if <c>DataProtection:KeysDirectory</c> is not configured
    /// (ephemeral key ring), the guard must throw an <see cref="InvalidOperationException"/> whose message
    /// identifies the missing configuration key.</summary>
    [Fact]
    public async Task Boot_WithEphemeralKeysDir_FailsFast()
    {
        // Arrange: drive the guard directly in a Production environment with no config set.
        // (WAF-based bootstrap swallows the hosted-service exception in a disposed-provider error,
        //  so we test the guard logic in isolation — same behavioural contract, deterministic.)
        var services = new ServiceCollection();
        services.AddSingleton<IConfiguration>(new ConfigurationBuilder().Build());
        services.AddSingleton<IHostEnvironment>(new ProductionEnvironment());
        services.AddLogging();
        services.AddSingleton<DataProtectionKeyRingGuard>();

        await using var provider = services.BuildServiceProvider();
        var guard = provider.GetRequiredService<DataProtectionKeyRingGuard>();

        // Act + Assert
        var act = () => guard.StartAsync(CancellationToken.None);
        await act.Should()
            .ThrowAsync<InvalidOperationException>(
                "the guard must fail fast when DataProtection:KeysDirectory is not configured in non-Development")
            .WithMessage("*DataProtection:KeysDirectory*");
    }

    // ── TryUnprotect tests ────────────────────────────────────────────────────────

    /// <summary>TryUnprotect round-trips a value that was previously protected.</summary>
    [Fact]
    public void TryUnprotect_ValidCiphertext_ReturnsPlaintext()
    {
        // Arrange
        var dir = Path.Combine(Path.GetTempPath(), "taxi-dp-try-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        try
        {
            using var services = BuildServices(dir);
            var protector = services.GetRequiredService<IFleetKeyProtector>();
            const string plaintext = "try-unprotect-round-trip-key";

            // Act
            var ciphertext = protector.Protect(plaintext);
            var result = protector.TryUnprotect(ciphertext);

            // Assert
            result.Should().Be(plaintext, "TryUnprotect must return the original plaintext for a valid ciphertext");
        }
        finally
        {
            Directory.Delete(dir, recursive: true);
        }
    }

    /// <summary>TryUnprotect returns null (not throws) for a raw, non-ciphertext value.</summary>
    [Fact]
    public void TryUnprotect_RawNonCiphertextValue_ReturnsNull()
    {
        // Arrange
        var dir = Path.Combine(Path.GetTempPath(), "taxi-dp-raw-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        try
        {
            using var services = BuildServices(dir);
            var protector = services.GetRequiredService<IFleetKeyProtector>();
            const string rawKey = "Z8Bbu1ZRQQbe6SwQceTtx-7B9qqJptwO32s3Xaz6nxY";

            // Act
            var result = protector.TryUnprotect(rawKey);

            // Assert
            result.Should().BeNull("a raw non-ciphertext value must yield null, not throw CryptographicException");
        }
        finally
        {
            Directory.Delete(dir, recursive: true);
        }
    }

    /// <summary>TryUnprotect returns null for null or empty input without throwing.</summary>
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    public void TryUnprotect_NullOrEmpty_ReturnsNull(string? input)
    {
        // Arrange
        var dir = Path.Combine(Path.GetTempPath(), "taxi-dp-nil-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        try
        {
            using var services = BuildServices(dir);
            var protector = services.GetRequiredService<IFleetKeyProtector>();

            // Act
            var result = protector.TryUnprotect(input);

            // Assert
            result.Should().BeNull("null/empty input must return null");
        }
        finally
        {
            Directory.Delete(dir, recursive: true);
        }
    }

    // ── helpers ───────────────────────────────────────────────────────────────────

    private static ServiceProvider BuildServices(string keysDir)
    {
        var services = new ServiceCollection();
        services.AddDataProtection()
            .PersistKeysToFileSystem(new DirectoryInfo(keysDir))
            .SetApplicationName("taxi");
        services.AddSingleton<IFleetKeyProtector, FleetKeyProtector>();
        return services.BuildServiceProvider();
    }

    /// <summary>Stub <see cref="IHostEnvironment"/> that reports a Production (non-Development) environment.</summary>
    private sealed class ProductionEnvironment : IHostEnvironment
    {
        /// <inheritdoc />
        public string EnvironmentName { get; set; } = Environments.Production;

        /// <inheritdoc />
        public string ApplicationName { get; set; } = "Taxi.Api";

        /// <inheritdoc />
        public string ContentRootPath { get; set; } = Path.GetTempPath();

        /// <inheritdoc />
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}

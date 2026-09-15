using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Taxi.Api.Features.Auth;
using Taxi.Api.Infrastructure.Sms;

namespace Taxi.Api.Tests.Infra;

/// <summary>Unit tests for <see cref="DevConsoleSmsSender"/> behavior (dev/prod branches)
/// and the <see cref="AuthFeatureConfiguration"/> factory selection by <c>Sms:DevLogCode</c>.</summary>
public sealed class DevConsoleSmsSenderTests
{
    // ── IHostEnvironment stubs ─────────────────────────────────────────────────────

    /// <summary>Stub that reports Development environment.</summary>
    private sealed class DevelopmentEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = Environments.Development;
        public string ApplicationName { get; set; } = "Taxi.Api";
        public string ContentRootPath { get; set; } = Path.GetTempPath();
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }

    /// <summary>Stub that reports Production environment.</summary>
    private sealed class ProductionEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = Environments.Production;
        public string ApplicationName { get; set; } = "Taxi.Api";
        public string ContentRootPath { get; set; } = Path.GetTempPath();
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }

    // ── ILogger spy ───────────────────────────────────────────────────────────────

    /// <summary>Hand-written spy for <see cref="ILogger{T}"/> that records every captured log entry.</summary>
    private sealed class LoggerSpy<T> : ILogger<T>
    {
        public record struct Entry(LogLevel Level, string? MessageTemplate, IReadOnlyList<KeyValuePair<string, object?>> State);

        public List<Entry> Entries { get; } = [];

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(
            LogLevel logLevel,
            EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter)
        {
            var kvps = state as IReadOnlyList<KeyValuePair<string, object?>> ?? [];
            Entries.Add(new Entry(logLevel, formatter(state, exception), kvps));
        }
    }

    // ── Behavior tests ────────────────────────────────────────────────────────────

    /// <summary>In Development, the log entry contains the full body (the OTP code) and does NOT contain the full E.164 phone.</summary>
    [Fact]
    public async Task SendAsync_DevelopmentEnvironment_LogsFullBodyMaskedPhone()
    {
        // Arrange
        var spy = new LoggerSpy<DevConsoleSmsSender>();
        var env = new DevelopmentEnvironment();
        var sender = new DevConsoleSmsSender(spy, env);
        const string phone = "+420777123456";
        const string message = "Your Taxi verification code: 123456";
        const string code = "123456";

        // Act
        await sender.SendAsync(phone, message, TestContext.Current.CancellationToken);

        // Assert
        spy.Entries.Should().ContainSingle(e => e.Level == LogLevel.Information);
        var entry = spy.Entries.Single(e => e.Level == LogLevel.Information);

        // The rendered message (or args) must contain the body substring (the OTP code)
        // and must NOT contain the full E.164 phone (PII).
        entry.MessageTemplate.Should().Contain(code, because: "dev branch must log the full body containing the OTP");
        entry.MessageTemplate.Should().NotContain(phone, because: "full E.164 phone is PII and must never appear in logs");

        // The masked value "****3456" must be present (last-4 masking)
        entry.MessageTemplate.Should().Contain("****3456", because: "phone must be masked to last-4 in dev branch too");
    }

    /// <summary>In Production, the log entry contains only the masked phone marker and NOT the body/code.</summary>
    [Fact]
    public async Task SendAsync_ProductionEnvironment_LogsMaskedMarkerOnly()
    {
        // Arrange
        var spy = new LoggerSpy<DevConsoleSmsSender>();
        var env = new ProductionEnvironment();
        var sender = new DevConsoleSmsSender(spy, env);
        const string phone = "+420777123456";
        const string message = "Your Taxi verification code: 123456";
        const string code = "123456";

        // Act
        await sender.SendAsync(phone, message, TestContext.Current.CancellationToken);

        // Assert
        spy.Entries.Should().ContainSingle(e => e.Level == LogLevel.Information);
        var entry = spy.Entries.Single(e => e.Level == LogLevel.Information);

        // In production: masked marker only, no body, no code
        entry.MessageTemplate.Should().NotContain(code, because: "production branch must never log the OTP code");
        entry.MessageTemplate.Should().NotContain(message, because: "production branch must never log the full body");
        entry.MessageTemplate.Should().Contain("****3456", because: "phone must be masked to last-4 in production too");
    }

    // ── DI factory-selection tests ────────────────────────────────────────────────

    /// <summary>When Sms:DevLogCode=true, AddFeatureDependencies resolves DevConsoleSmsSender.</summary>
    [Fact]
    public void AddFeatureDependencies_DevLogCodeTrue_ResolvesDevConsoleSmsSender()
    {
        // Arrange
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton<IHostEnvironment>(new DevelopmentEnvironment());  // required by factory lambda

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Sms:DevLogCode"] = "true" })
            .Build();

        // Act
        new AuthFeatureConfiguration().AddFeatureDependencies(services, config);
        using var provider = services.BuildServiceProvider();
        var sender = provider.GetRequiredService<ISmsSender>();

        // Assert
        sender.Should().BeOfType<DevConsoleSmsSender>(because: "Sms:DevLogCode=true must select DevConsoleSmsSender");
    }

    /// <summary>When Sms:DevLogCode=false, AddFeatureDependencies resolves ConsoleSmsSender.</summary>
    [Fact]
    public void AddFeatureDependencies_DevLogCodeFalse_ResolvesConsoleSmsSender()
    {
        // Arrange
        var services = new ServiceCollection();
        services.AddLogging();

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Sms:DevLogCode"] = "false" })
            .Build();

        // Act
        new AuthFeatureConfiguration().AddFeatureDependencies(services, config);
        using var provider = services.BuildServiceProvider();
        var sender = provider.GetRequiredService<ISmsSender>();

        // Assert
        sender.Should().BeOfType<ConsoleSmsSender>(because: "Sms:DevLogCode=false must select ConsoleSmsSender");
    }

    /// <summary>When Sms:DevLogCode is absent (unset), AddFeatureDependencies defaults to ConsoleSmsSender.</summary>
    [Fact]
    public void AddFeatureDependencies_DevLogCodeUnset_ResolvesConsoleSmsSender()
    {
        // Arrange
        var services = new ServiceCollection();
        services.AddLogging();

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>())
            .Build();

        // Act
        new AuthFeatureConfiguration().AddFeatureDependencies(services, config);
        using var provider = services.BuildServiceProvider();
        var sender = provider.GetRequiredService<ISmsSender>();

        // Assert
        sender.Should().BeOfType<ConsoleSmsSender>(because: "absent Sms:DevLogCode must default to ConsoleSmsSender");
    }
}

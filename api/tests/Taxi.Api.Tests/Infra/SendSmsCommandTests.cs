using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Taxi.Api.Common.Cli;
using Taxi.Api.Tests.Infrastructure;

namespace Taxi.Api.Tests.Infra;

/// <summary>Unit tests for the <c>send-sms</c> CLI subcommand helper (<see cref="CliCommands.RunSendSmsAsync"/>).
/// Resolves a recording <c>ISmsSender</c> and asserts the parsed --to/--message reach the sender.</summary>
public sealed class SendSmsCommandTests
{
    [Fact]
    public async Task SendSms_ValidArgs_InvokesSmsSenderWithParsedToAndMessage()
    {
        var sender = new RecordingSmsSender();

        var sent = await CliCommands.RunSendSmsAsync(
            sender, "+420777123456", "Disk at 90%", NullLogger.Instance, TestContext.Current.CancellationToken);

        sent.Should().BeTrue();
        sender.Sent.Should().ContainSingle();
        sender.Sent.TryPeek(out var message).Should().BeTrue();
        message!.ToPhone.Should().Be("+420777123456");
        message.Body.Should().Be("Disk at 90%");
    }

    [Fact]
    public async Task SendSms_MissingTo_LogsErrorAndReturnsWithoutSending()
    {
        var sender = new RecordingSmsSender();

        var sent = await CliCommands.RunSendSmsAsync(
            sender, to: null, message: "Disk at 90%", NullLogger.Instance, TestContext.Current.CancellationToken);

        sent.Should().BeFalse();
        sender.Sent.Should().BeEmpty();
    }

    [Fact]
    public async Task SendSms_MissingMessage_LogsErrorAndReturnsWithoutSending()
    {
        var sender = new RecordingSmsSender();

        var sent = await CliCommands.RunSendSmsAsync(
            sender, to: "+420777123456", message: null, NullLogger.Instance, TestContext.Current.CancellationToken);

        sent.Should().BeFalse();
        sender.Sent.Should().BeEmpty();
    }
}

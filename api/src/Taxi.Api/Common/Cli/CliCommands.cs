using Microsoft.EntityFrameworkCore;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Notifications;

namespace Taxi.Api.Common.Cli;

/// <summary>Testable implementations of the CLI arg-subcommands invoked from <c>Program.cs</c> before the
/// web host boots (mirrors the create-superadmin intercept). Each method runs its work in the provided
/// scope and returns; the Program.cs intercept is a thin shell resolving these from an async scope.</summary>
internal static class CliCommands
{
    /// <summary>Runs EF Core migrations to the latest version. Invoked by <c>dotnet run -- migrate</c>,
    /// which the deploy runs (<c>compose run --rm api migrate</c>) before <c>up</c>. Idempotent — a no-op
    /// against an already-migrated database.</summary>
    /// <param name="dbContext">The scoped <see cref="TaxiDbContext"/>.</param>
    /// <param name="logger">Logger for the completion line.</param>
    /// <param name="ct">Cancellation token.</param>
    public static async Task RunMigrateAsync(TaxiDbContext dbContext, ILogger logger, CancellationToken ct = default)
    {
        await dbContext.Database.MigrateAsync(ct);
        logger.LogInformation("Database migrated {Command}", "migrate");
    }

    /// <summary>Sends a single SMS via the config-selected real provider. Invoked by
    /// <c>dotnet run -- send-sms --to &lt;e164&gt; --message &lt;text&gt;</c> — used by the disk-alert cron.
    /// Never logs the message body or the full phone number (rules/logging.md).</summary>
    /// <param name="smsSender">The Notifications <see cref="ISmsSender"/> (real config-selected provider).</param>
    /// <param name="to">Recipient E.164 phone number.</param>
    /// <param name="message">The message text.</param>
    /// <param name="logger">Logger for the outcome line.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns><c>true</c> when the arguments were valid and a send was attempted; <c>false</c> when a
    /// required argument was missing (nothing sent).</returns>
    public static async Task<bool> RunSendSmsAsync(
        ISmsSender smsSender, string? to, string? message, ILogger logger, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(to) || string.IsNullOrWhiteSpace(message))
        {
            logger.LogError("send-sms missing argument {Reason}", "MissingToOrMessage");
            return false;
        }

        var result = await smsSender.SendAsync(new SmsMessage(to, message, SenderName: null), ct);
        logger.LogInformation("send-sms completed {ToPhoneMasked} {Success}", Mask(to), result.Success);
        return true;
    }

    private static string Mask(string phone)
        => phone.Length <= 4 ? "****" : $"****{phone[^4..]}";
}

/// <summary>Marker type used only as the category for <c>ILogger&lt;CliCommandsMarker&gt;</c> so the CLI
/// intercepts in <c>Program.cs</c> get a logger with a stable SourceContext (the <see cref="CliCommands"/>
/// static class cannot be a generic type parameter).</summary>
internal sealed class CliCommandsMarker;

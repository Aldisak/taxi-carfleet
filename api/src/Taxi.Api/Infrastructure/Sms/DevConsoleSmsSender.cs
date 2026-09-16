using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Taxi.Api.Infrastructure.Sms;

/// <summary>
/// <strong>DEVELOPMENT-ONLY</strong> SMS sender that logs the full OTP body to the console
/// so developers can complete the customer SMS-code login flow without a real SMS gateway.
///
/// <para>WHY the body is intentionally logged (documented exception to rules/logging.md#what-must-not-appear-in-logs):
/// The OTP code is the only way for a developer to complete <c>POST auth/customer/verify-code</c> locally.
/// The hashed code is stored in the DB and the raw code is never recoverable from it, so we intentionally
/// log the raw message body in Development to enable local testing.</para>
///
/// <para>PRODUCTION GUARD: the runtime <c>IHostEnvironment.IsDevelopment()</c> check is the sole
/// guarantee against a production leak — even if <c>Sms:DevLogCode=true</c> were somehow set in a
/// non-Development environment, this sender logs only the masked phone marker (never the body).</para>
/// </summary>
internal sealed class DevConsoleSmsSender(ILogger<DevConsoleSmsSender> logger, IHostEnvironment env) : ISmsSender
{
    /// <inheritdoc />
    public Task SendAsync(string phone, string message, CancellationToken ct)
    {
        // Mask phone to last-4 digits only — phone is PII and is masked in BOTH branches.
        var masked = phone.Length >= 4
            ? $"****{phone[^4..]}"
            : "****";

        if (env.IsDevelopment())
        {
            // Development-only: log the full body so developers can read the OTP code.
            // The phone is still masked — only {Body} is raw (intentional, documented exception).
            logger.LogInformation("Dev SMS {Phone} {Body}", masked, message);
        }
        else
        {
            // Non-development: mirror ConsoleSmsSender exactly — masked marker only, never the body.
            logger.LogInformation("Sms sent {Phone}", masked);
        }

        return Task.CompletedTask;
    }
}

namespace Taxi.Api.Infrastructure.Notifications;

/// <summary>A rendered SMS ready to send.</summary>
/// <param name="ToPhone">Recipient phone number (E.164).</param>
/// <param name="Body">The rendered GSM-7 message body.</param>
/// <param name="SenderName">Optional sender name shown on the message.</param>
public sealed record SmsMessage(string ToPhone, string Body, string? SenderName);

/// <summary>Result of an SMS send attempt.</summary>
/// <param name="Success">Whether the provider accepted the message.</param>
/// <param name="ProviderMessageId">Provider-assigned message id, when available.</param>
public sealed record SmsSendResult(bool Success, string? ProviderMessageId);

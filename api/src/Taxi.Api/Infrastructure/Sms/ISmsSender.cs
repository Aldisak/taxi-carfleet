namespace Taxi.Api.Infrastructure.Sms;

/// <summary>Abstraction for sending SMS messages. Implementations may use a real SMS gateway (production)
/// or log to console (development). The message body must never contain raw secrets — callers are
/// responsible for not embedding raw OTP codes in log statements; only the implementation writes the message.</summary>
public interface ISmsSender
{
    /// <summary>Sends an SMS message to the specified phone number.</summary>
    /// <param name="phone">The E.164 phone number to send to.</param>
    /// <param name="message">The message body (caller is responsible for content — do not log it).</param>
    /// <param name="ct">Cancellation token.</param>
    Task SendAsync(string phone, string message, CancellationToken ct);
}

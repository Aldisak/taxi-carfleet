namespace Taxi.Api.Infrastructure.Notifications;

/// <summary>A rendered Web Push payload (≤ 3 KB JSON): <c>{ title, body, url, tag, priority }</c>.</summary>
/// <param name="Title">Notification title.</param>
/// <param name="Body">Notification body.</param>
/// <param name="Url">URL opened on notification click.</param>
/// <param name="Tag">Notification tag (collapses duplicate notifications).</param>
/// <param name="Priority">Priority hint ("high" for driver offers).</param>
public sealed record PushMessage(string Title, string Body, string Url, string Tag, string Priority);

/// <summary>The outcome of a push send attempt.</summary>
public enum PushSendOutcome
{
    /// <summary>Accepted by the push service.</summary>
    Sent,

    /// <summary>The subscription is gone (HTTP 410) — it was deleted.</summary>
    Gone,

    /// <summary>A retryable failure.</summary>
    Failed
}

/// <summary>Result of a push send.</summary>
/// <param name="Outcome">The send outcome.</param>
/// <param name="ProviderMessageId">Optional provider identifier.</param>
public sealed record PushSendResult(PushSendOutcome Outcome, string? ProviderMessageId);

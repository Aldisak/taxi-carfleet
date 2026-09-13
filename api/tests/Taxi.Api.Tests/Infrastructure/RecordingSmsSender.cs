using System.Collections.Concurrent;
using Taxi.Api.Infrastructure.Notifications;

namespace Taxi.Api.Tests.Infrastructure;

/// <summary>Test <see cref="ISmsSender"/> that records every sent message (and can be forced to fail)
/// so tests can assert exactly what SMS was produced and count send invocations.</summary>
internal sealed class RecordingSmsSender : ISmsSender
{
    /// <summary>All messages passed to <see cref="SendAsync"/>, in order.</summary>
    public ConcurrentQueue<SmsMessage> Sent { get; } = new();

    /// <summary>When true, every send reports failure (to exercise the retry/Failed path).</summary>
    public bool FailAll { get; set; }

    /// <inheritdoc />
    public Task<SmsSendResult> SendAsync(SmsMessage message, CancellationToken ct)
    {
        if (FailAll)
            return Task.FromResult(new SmsSendResult(false, null));

        Sent.Enqueue(message);
        return Task.FromResult(new SmsSendResult(true, $"rec-{Guid.CreateVersion7():N}"));
    }
}

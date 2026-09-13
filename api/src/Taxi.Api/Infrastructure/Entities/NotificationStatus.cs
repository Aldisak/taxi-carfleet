namespace Taxi.Api.Infrastructure.Entities;

/// <summary>Delivery status of an outbox row or log row. Stored as a string.</summary>
public enum NotificationStatus
{
    /// <summary>Queued, waiting for the dispatch job to send it.</summary>
    Queued,

    /// <summary>Successfully handed to the provider.</summary>
    Sent,

    /// <summary>Failed after exhausting retries.</summary>
    Failed,

    /// <summary>Skipped because a duplicate outbox row already claimed/sent this notification.</summary>
    Skipped,

    /// <summary>Skipped because the monthly SMS cost cap was reached (non-arrival SMS).</summary>
    SkippedCap,

    /// <summary>Skipped because the recipient has no channel available.</summary>
    SkippedNoChannel
}

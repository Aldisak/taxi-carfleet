using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Common.Gdpr;

/// <summary>Shared GDPR anonymization of an order's customer identity. Used by the retention job
/// (orders older than 24 months) and by customer self-deletion. The order ROW is kept (so reports still
/// count it) — only the customer-identifying fields are sentinel-ized.</summary>
internal static class CustomerAnonymizer
{
    /// <summary>Sentinel phone applied to anonymized orders (spec §Data retention).</summary>
    public const string SentinelPhone = "+420000000000";

    /// <summary>Sentinel name applied to anonymized orders.</summary>
    public const string SentinelName = "Anonymizováno";

    /// <summary>Anonymizes the customer identity on an order in place: clears the customer user link and
    /// replaces the phone/name with sentinels. The order is not deleted.</summary>
    /// <param name="order">The tracked order to anonymize.</param>
    public static void Anonymize(Order order)
    {
        order.CustomerUserId = null;
        order.CustomerPhone = SentinelPhone;
        order.CustomerName = SentinelName;
    }
}

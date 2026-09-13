namespace Taxi.Api.Common.Notifications;

/// <summary>The role that receives a notification. Kept separate from <c>UserRole</c> because a
/// notification recipient is a routing concept (Customer / Driver / Dispatcher / FleetAdmin),
/// not an authorization principal.</summary>
public enum NotificationRecipientRole
{
    /// <summary>The order's customer.</summary>
    Customer,

    /// <summary>The order's (offered or assigned) driver.</summary>
    Driver,

    /// <summary>The fleet's dispatch desk.</summary>
    Dispatcher,

    /// <summary>The fleet admin (cost-cap warnings).</summary>
    FleetAdmin
}

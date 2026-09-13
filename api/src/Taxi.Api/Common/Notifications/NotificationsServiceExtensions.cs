using Taxi.Api.Infrastructure.Notifications;

namespace Taxi.Api.Common.Notifications;

/// <summary>Registers the notification engine (A4) and channels (A5) in the DI container.</summary>
internal static class NotificationsServiceExtensions
{
    /// <summary>Registers <see cref="INotificationService"/> (scoped — shares the request/transition
    /// DbContext), binds options, and wires the SMS/Push channel adapters (config-selected).</summary>
    public static IServiceCollection AddNotifications(
        this IServiceCollection services, IConfiguration configuration)
    {
        services.AddScoped<INotificationService, NotificationService>();

        services.Configure<NotificationPublicOptions>(
            configuration.GetSection(NotificationPublicOptions.SectionName));
        services.Configure<NotificationOptions>(
            configuration.GetSection(NotificationOptions.SectionName));

        // SMS sender — config-selected; Console is the dev/test default.
        var provider = configuration[$"{NotificationOptions.SectionName}:SmsProvider"] ?? "Console";
        switch (provider.ToLowerInvariant())
        {
            case "gosms":
                services.AddHttpClient<ISmsSender, GoSmsSender>();
                break;
            case "smsbrana":
                services.AddHttpClient<ISmsSender, SmsbranaSmsSender>();
                break;
            default:
                services.AddScoped<ISmsSender, ConsoleSmsSender>();
                break;
        }

        // Push sender — WebPush when VAPID keys are present, else NoOp.
        var vapidPublic = configuration[$"{NotificationOptions.SectionName}:VapidPublicKey"];
        if (string.IsNullOrWhiteSpace(vapidPublic))
            services.AddScoped<IPushSender, NoOpPushSender>();
        else
            services.AddScoped<IPushSender, WebPushSender>();

        return services;
    }
}

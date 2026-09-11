namespace Taxi.Api.Realtime;

/// <summary>Extension methods for registering realtime (SignalR) services in the DI container.</summary>
internal static class RealtimeServiceExtensions
{
    /// <summary>Registers the SignalR-backed <see cref="IRealtimePublisher"/> implementation
    /// and the singleton <see cref="DriverPositionStore"/>.</summary>
    public static IServiceCollection AddRealtime(this IServiceCollection services)
    {
        services.AddSingleton<DriverPositionStore>();
        services.AddSingleton<IRealtimePublisher, SignalRRealtimePublisher>();
        return services;
    }
}

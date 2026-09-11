namespace Taxi.Api.Infrastructure.Entities;

/// <summary>How an <see cref="Order"/> was created.</summary>
public enum OrderSource
{
    /// <summary>Order was placed by phone call through the dispatcher.</summary>
    Phone,

    /// <summary>Order was placed by a customer via the mobile app.</summary>
    App,

    /// <summary>Order was created directly by a dispatcher in the web UI.</summary>
    Dispatcher
}

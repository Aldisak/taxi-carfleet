using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Common.Orders;

/// <summary>Represents the actor performing an order transition.
/// <para><b>System actor</b>: use the <see cref="System"/> factory property, which sets
/// <c>Role = UserRole.System</c>, <c>UserId = null</c>, and <c>DriverId = null</c>.
/// Used for the Timeout transition which has no human actor. <c>ActorRole</c> on the persisted
/// <see cref="Taxi.Api.Infrastructure.Entities.OrderEvent"/> is set to <c>UserRole.System</c>.</para>
/// </summary>
public sealed record Actor
{
    /// <summary>The user's primary key. Null for system-initiated transitions.</summary>
    public Guid? UserId { get; }

    /// <summary>The actor's role.</summary>
    public UserRole Role { get; }

    /// <summary>The driver row ID when the actor is a driver. Null for all other roles.</summary>
    public Guid? DriverId { get; }

    /// <summary>Creates an actor for a human user.</summary>
    /// <param name="userId">The user's ID.</param>
    /// <param name="role">The user's role.</param>
    /// <param name="driverId">The driver row ID if the role is Driver; null otherwise.</param>
    public Actor(Guid userId, UserRole role, Guid? driverId = null)
    {
        UserId = userId;
        Role = role;
        DriverId = driverId;
    }

    // Private constructor for the System singleton.
    private Actor(UserRole role)
    {
        UserId = null;
        Role = role;
        DriverId = null;
    }

    /// <summary>Pre-built system actor for automated transitions (Timeout, auto-dispatch).</summary>
    public static Actor System { get; } = new(UserRole.System);
}

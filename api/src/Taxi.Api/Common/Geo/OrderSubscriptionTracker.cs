using System.Collections.Concurrent;

namespace Taxi.Api.Common.Geo;

/// <summary>In-memory singleton tracker for SignalR order-group subscriptions.
/// Maintains a viewer count per order (incremented when a customer joins <c>order:{id}</c> via
/// <see cref="Taxi.Api.Realtime.FleetHub.Subscribe"/>, decremented on disconnect) and a
/// per-connection set of subscribed order IDs so <see cref="RemoveConnection"/> can clean up all
/// groups atomically when a client disconnects.
/// <para>
/// Thread-safe — all mutations use <c>lock</c> over the connection→orders map plus
/// a <see cref="ConcurrentDictionary{TKey,TValue}"/> for the count map so reads are lock-free.
/// </para>
/// <para>
/// Mirrors the <see cref="Taxi.Api.Realtime.DriverPositionStore"/> singleton pattern.
/// Tests must call <see cref="Reset"/> before each test that checks viewer counts (shared singleton
/// across the test collection — see CLAUDE.md UC-004 discipline).
/// </para>
/// </summary>
internal sealed class OrderSubscriptionTracker
{
    private readonly ConcurrentDictionary<Guid, int> _viewerCounts = new();
    private readonly Dictionary<string, HashSet<Guid>> _connectionOrders = new();
    private readonly object _connLock = new();

    /// <summary>Registers a subscription: increments the viewer count for <paramref name="orderId"/>
    /// and records the association between <paramref name="connectionId"/> and <paramref name="orderId"/>
    /// so <see cref="RemoveConnection"/> can decrement all groups for that connection on disconnect.</summary>
    /// <param name="connectionId">SignalR connection ID of the subscriber.</param>
    /// <param name="orderId">Order being subscribed to.</param>
    public void Add(string connectionId, Guid orderId)
    {
        lock (_connLock)
        {
            if (!_connectionOrders.TryGetValue(connectionId, out var orderSet))
            {
                orderSet = new HashSet<Guid>();
                _connectionOrders[connectionId] = orderSet;
            }

            if (orderSet.Add(orderId))
            {
                // Only increment when this connection has not already subscribed to this order.
                _viewerCounts.AddOrUpdate(orderId, 1, (_, old) => old + 1);
            }
        }
    }

    /// <summary>Removes all subscriptions for a disconnected connection, decrementing the viewer
    /// count for every order that connection had joined. Counts never go below zero.</summary>
    /// <param name="connectionId">SignalR connection ID that has disconnected.</param>
    public void RemoveConnection(string connectionId)
    {
        lock (_connLock)
        {
            if (!_connectionOrders.TryGetValue(connectionId, out var orderSet))
                return;

            _connectionOrders.Remove(connectionId);

            foreach (var orderId in orderSet)
            {
                _viewerCounts.AddOrUpdate(orderId, 0, (_, old) => Math.Max(0, old - 1));
            }
        }
    }

    /// <summary>Returns the number of active viewers (SignalR connections subscribed to <c>order:{orderId}</c>).</summary>
    /// <param name="orderId">The order identifier.</param>
    public int ViewerCount(Guid orderId) =>
        _viewerCounts.TryGetValue(orderId, out var count) ? count : 0;

    /// <summary>Returns true when at least one client is subscribed to <c>order:{orderId}</c>.</summary>
    /// <param name="orderId">The order identifier.</param>
    public bool HasViewers(Guid orderId) => ViewerCount(orderId) > 0;

    /// <summary>Resets all state. Must be called at the start of every test that inspects viewer
    /// counts — this is a shared singleton across the test collection (CLAUDE.md UC-004 discipline).</summary>
    public void Reset()
    {
        lock (_connLock)
        {
            _viewerCounts.Clear();
            _connectionOrders.Clear();
        }
    }
}

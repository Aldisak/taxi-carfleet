using System.Text.Json;

namespace Taxi.Api.Features.Orders.GetOrderEvents;

/// <summary>Projection of a single <see cref="Taxi.Api.Infrastructure.Entities.OrderEvent"/> returned
/// in the events feed. Payload is exposed as a raw <see cref="JsonElement"/> so callers receive the
/// original JSON structure without re-serialization overhead or disposal concerns.</summary>
/// <param name="Type">Event type name (string).</param>
/// <param name="FromStatus">Status before the event. Null for Created events.</param>
/// <param name="ToStatus">Status after the event.</param>
/// <param name="ActorRole">Role of the actor who triggered the event.</param>
/// <param name="At">UTC timestamp when the event occurred.</param>
/// <param name="Payload">Arbitrary JSON payload for the event. Null when no payload was recorded.</param>
public record OrderEventDto(
    string Type,
    string? FromStatus,
    string ToStatus,
    string ActorRole,
    DateTimeOffset At,
    JsonElement? Payload);

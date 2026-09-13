namespace Taxi.Api.Features.Push.Subscribe;

/// <summary>Response for POST /push/subscriptions — returns the persisted subscription id.</summary>
/// <param name="Id">The subscription's primary key.</param>
public record SubscribeResponse(Guid Id);

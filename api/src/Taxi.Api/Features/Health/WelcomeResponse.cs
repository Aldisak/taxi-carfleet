namespace Taxi.Api.Features.Health;

/// <summary>Response returned by the welcome / root endpoint.</summary>
/// <param name="Message">A short greeting message.</param>
/// <param name="Version">The API version string.</param>
public record WelcomeResponse(string Message, string Version);

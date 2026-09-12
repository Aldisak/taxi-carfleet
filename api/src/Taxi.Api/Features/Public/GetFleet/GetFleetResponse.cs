namespace Taxi.Api.Features.Public.GetFleet;

/// <summary>Public branding fields for the resolved fleet, returned by GET public/fleet.</summary>
/// <param name="Name">Display name of the fleet.</param>
/// <param name="Phone">Contact phone number (E.164) — the Zavolat button target.</param>
/// <param name="PrimaryColorHex">Optional brand color (#RRGGBB). Null means the client uses its theme token.</param>
/// <param name="Currency">ISO 4217 currency code (e.g. CZK).</param>
/// <param name="TimeZone">IANA time zone identifier (e.g. Europe/Prague).</param>
public record GetFleetResponse(
    string Name,
    string Phone,
    string? PrimaryColorHex,
    string Currency,
    string TimeZone);

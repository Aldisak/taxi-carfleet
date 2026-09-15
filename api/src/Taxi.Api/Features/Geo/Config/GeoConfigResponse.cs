namespace Taxi.Api.Features.Geo.Config;

/// <summary>Response for GET /geo/config — Mapy.com tile configuration for the fleet's map.
/// Contains ONLY the browser key; the server key is structurally absent from this record.</summary>
/// <param name="TileUrlTemplate">Mapy.com raster tile URL template with <c>{z}/{x}/{y}</c> and <c>{apikey}</c> placeholders.</param>
/// <param name="BrowserKey">Mapy.com browser API key for this fleet (decrypted); use as the <c>{apikey}</c> value.</param>
/// <param name="AttributionHtml">Mandatory Mapy.com attribution HTML to render in the Leaflet attribution control.</param>
/// <param name="MapCenterLat">Default map center latitude for this fleet (WGS84).</param>
/// <param name="MapCenterLng">Default map center longitude for this fleet (WGS84).</param>
/// <param name="MapZoom">Default map zoom level for this fleet.</param>
public record GeoConfigResponse(
    string TileUrlTemplate,
    string BrowserKey,
    string AttributionHtml,
    double MapCenterLat,
    double MapCenterLng,
    int MapZoom);

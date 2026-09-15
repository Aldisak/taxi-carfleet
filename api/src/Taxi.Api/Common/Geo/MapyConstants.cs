namespace Taxi.Api.Common.Geo;

/// <summary>Mapy.com tile and attribution constants used by the geo config endpoint.
/// The tile URL template contains <c>{z}/{x}/{y}</c> placeholders consumed by Leaflet.
/// Attribution is mandatory per Mapy.com Extended Tariff terms and must be rendered
/// in the Leaflet attribution control on all three clients.</summary>
internal static class MapyConstants
{
    /// <summary>Mapy.com raster tile URL template (basic set, 256 px).
    /// The <c>{apikey}</c> placeholder must be replaced with the fleet's browser key at render time.
    /// Clients should use <c>@2x</c> tiles when <c>devicePixelRatio &gt; 1.5</c>.</summary>
    public const string TileUrlTemplate =
        "https://api.mapy.cz/v1/maptiles/basic/256/{z}/{x}/{y}?apikey={apikey}";

    /// <summary>HTML attribution string required by Mapy.com for all public-facing maps.
    /// Must be rendered in the Leaflet attribution control. Includes a link and logo reference.</summary>
    public const string AttributionHtml =
        "<a href=\"https://api.mapy.cz/copyright\" target=\"_blank\">&copy; Seznam.cz, a.s. a další</a>";
}

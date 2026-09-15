/**
 * Pure helpers for building the Mapy.com raster tile URL from the /geo/config template.
 *
 * The backend returns a template of the shape
 *   https://api.mapy.cz/v1/maptiles/basic/256/{z}/{x}/{y}?apikey={apikey}
 * where {z}/{x}/{y} are Leaflet placeholders (filled by the TileLayer at pan/zoom time) and
 * {apikey} is the per-fleet browser key. Retina screens (devicePixelRatio > 1.5) request the
 * @2x variant of the 256 px basic tile set (256@2x) per Mapy's raster tile convention. These
 * functions are pure so the retina rule is unit-testable without a real map (jsdom dpr = 1).
 */

/** Resolve the tile pixel ratio for a given device pixel ratio: @2x tiles only above 1.5 dpr. */
export function resolveTilePixelRatio(devicePixelRatio: number): 1 | 2 {
  return devicePixelRatio > 1.5 ? 2 : 1
}

/**
 * Build the Leaflet tile URL from the config template: substitute the browser key into {apikey}
 * and, on retina (ratio === 2), switch the basic 256 tile-size segment to 256@2x. The {z}/{x}/{y}
 * placeholders are left intact for Leaflet to fill.
 */
export function buildTileUrl(template: string, browserKey: string, pixelRatio: 1 | 2): string {
  let url = template.replace('{apikey}', browserKey)
  if (pixelRatio === 2) {
    // Basic raster set: /basic/256/ → /basic/256@2x/ (only when not already retina).
    url = url.replace('/256/', '/256@2x/')
  }
  return url
}

/**
 * Leaflet icon URL fix for Vite/Webpack bundlers.
 *
 * Leaflet's default icon relies on CSS background-image URLs that point to
 * images in the leaflet/dist/images/ folder. When bundling with Vite the
 * asset paths are fingerprinted and the auto-detection in Leaflet fails.
 * This module must be imported once (e.g. in main.tsx or App.tsx) before
 * any Leaflet map is rendered.
 *
 * We delete the _getIconUrl resolver so Leaflet uses the explicit iconUrl
 * we provide below, which point to the leaflet npm package's own images
 * (resolved by Vite at build time via the ?url query).
 */

import L from 'leaflet'
// Leaflet's own stylesheet — REQUIRED for tiles/panes to be positioned and sized (.leaflet-tile,
// .leaflet-pane, .leaflet-container overflow). Without it the tile grid renders broken/misaligned
// with white gaps on pan/zoom. Imported here (not eagerly) so it rides the lazy map chunk with the
// rest of leaflet, keeping it out of the eager app bundle. Must load before any map mounts.
import 'leaflet/dist/leaflet.css'

// Patch the default icon by nullifying the broken auto-resolver
// and providing explicit URLs from the leaflet package.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl

L.Icon.Default.mergeOptions({
  iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href,
  iconUrl: new URL('leaflet/dist/images/marker-icon.png', import.meta.url).href,
  shadowUrl: new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).href,
})

// The former OSM_TILE_URL / OSM_ATTRIBUTION / DEFAULT_CENTER / DEFAULT_ZOOM constants
// were removed in UC-010 (WI-18). Map tiles now come from Mapy.com via GET /geo/config
// (see useGeoConfig / MapyMap / tileTemplate); the map center + zoom are carried in that
// config response. This module now only performs the one-time Leaflet default-icon fix.

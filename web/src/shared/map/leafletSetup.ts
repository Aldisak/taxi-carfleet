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

// Patch the default icon by nullifying the broken auto-resolver
// and providing explicit URLs from the leaflet package.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl

L.Icon.Default.mergeOptions({
  iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href,
  iconUrl: new URL('leaflet/dist/images/marker-icon.png', import.meta.url).href,
  shadowUrl: new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).href,
})

/** OSM tile layer URL (standard tiles). */
export const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'

/** OSM tile layer attribution string. */
export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

/** Default map center: Kolín / Kutná Hora area. */
export const DEFAULT_CENTER: [number, number] = [50.03, 15.2]

/** Default zoom level showing the fleet area. */
export const DEFAULT_ZOOM = 11

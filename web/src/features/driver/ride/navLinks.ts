/**
 * Navigation app preference stored in localStorage.
 * 'geo' uses the universal geo: URI scheme.
 */
export type NavAppPreference = 'geo' | 'google' | 'mapy' | 'waze'

/**
 * Pure function: builds a navigation deep-link URL for the given preference and coordinates.
 * No side effects. The caller is responsible for opening the URL.
 *
 * @param preference  Nav app preference
 * @param lat         Destination latitude
 * @param lng         Destination longitude
 * @param label       Optional human-readable place name
 */
export function buildNavUrl(
  preference: NavAppPreference,
  lat: number,
  lng: number,
  label?: string,
): string {
  switch (preference) {
    case 'google':
      return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`

    case 'waze':
      return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`

    case 'mapy':
      return `https://mapy.cz/zakladni?x=${lng}&y=${lat}&z=17&pano=1&q=${encodeURIComponent(String(lat))}%2C${encodeURIComponent(String(lng))}`

    case 'geo':
    default:
      if (label) {
        return `geo:${lat},${lng}?q=${lat},${lng}(${encodeURIComponent(label)})`
      }
      return `geo:${lat},${lng}`
  }
}

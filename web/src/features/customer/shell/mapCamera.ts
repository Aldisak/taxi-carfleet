/**
 * Pure camera-decision logic for the customer map shell (UC-014 WI-2).
 *
 * This module holds ONLY the decision — which imperative Leaflet action a set of
 * target points implies (setView vs fitBounds, with the min-zoom clamp). It imports
 * nothing from react-leaflet/leaflet so it stays eager-safe and unit-testable; the
 * `useMap()` consumer that APPLIES an intent lives inside the lazy CustomerMapBackground
 * (mirroring board/MapPanel's MapCenterController). Exported for UC-015/016/019.
 */

/** A geographic point. */
export interface LatLng {
  lat: number
  lng: number
}

/** A geographic bounding box. */
export interface LatLngBounds {
  southWest: LatLng
  northEast: LatLng
}

/** Recenter on a single point at a (clamped) zoom. */
export interface SetViewIntent {
  kind: 'setView'
  center: LatLng
  zoom: number
}

/** Fit the viewport to a bounding box over multiple points. */
export interface FitBoundsIntent {
  kind: 'fitBounds'
  bounds: LatLngBounds
}

/** A camera move the map should perform imperatively, or null for no move. */
export type CameraIntent = SetViewIntent | FitBoundsIntent

/**
 * Minimum zoom the camera clamps up to for a single-point setView, so a recenter never
 * zooms out past street level (mirrors MapCenterController's Math.max(getZoom(), 14)).
 */
export const MIN_CAMERA_ZOOM = 14

/** Inputs the pure camera decision reads. */
export interface CameraInput {
  /** Target points to frame. 0 → no move, 1 → setView, >=2 → fitBounds. */
  points: LatLng[]
  /** The map's current zoom (used to clamp the single-point setView). */
  currentZoom: number
}

/**
 * Decides the camera move for a set of target points:
 * - 0 points → null (leave the camera where it is)
 * - 1 point → setView at that point, zoom clamped to at least MIN_CAMERA_ZOOM
 * - >=2 points → fitBounds over their bounding box
 */
export function cameraIntent({ points, currentZoom }: CameraInput): CameraIntent | null {
  if (points.length === 0) return null

  if (points.length === 1) {
    return {
      kind: 'setView',
      center: points[0],
      zoom: Math.max(currentZoom, MIN_CAMERA_ZOOM),
    }
  }

  let minLat = points[0].lat
  let maxLat = points[0].lat
  let minLng = points[0].lng
  let maxLng = points[0].lng
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat
    if (p.lat > maxLat) maxLat = p.lat
    if (p.lng < minLng) minLng = p.lng
    if (p.lng > maxLng) maxLng = p.lng
  }

  return {
    kind: 'fitBounds',
    bounds: {
      southWest: { lat: minLat, lng: minLng },
      northEast: { lat: maxLat, lng: maxLng },
    },
  }
}

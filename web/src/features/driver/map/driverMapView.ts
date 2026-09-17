/**
 * Pure marker/camera-point selection for the driver map (UC-019 WI-1).
 *
 * The driver analog of TrackingPage's `cameraTarget = [carMarker, pickupMarker].filter(...)`:
 * given the driver's own position and the current leg's endpoint, returns the non-null points
 * the camera should frame. The call site feeds these into `cameraIntent` (shared/map/mapCamera)
 * — 0 points → no move, 1 → setView on own, 2 → fitBounds over own + target.
 *
 * Imports only the LatLng TYPE from shared/map (no react, no leaflet) so it stays pure.
 */
import type { LatLng } from '../../../shared/map/mapCamera'

/** Inputs the driver camera-point selection reads. */
export interface DriverMapCameraInput {
  /** The driver's own current position, or null before the first fix. */
  own: LatLng | null
  /** The start of the active leg (the driver's own position during a ride). Signature slot only. */
  legStart: LatLng | null
  /** The endpoint of the active leg (pickup or dropoff), or null when no leg is active. */
  legEnd: LatLng | null
}

/**
 * Returns the non-null points to frame:
 * - own + legEnd → [own, legEnd] (fitBounds so both the driver and the target are visible)
 * - own only → [own] (setView on the driver)
 * - nothing known → [] (no camera move)
 *
 * `legStart` is deliberately NOT framed: during a ride WI-5 passes `legStart: own`, and framing
 * it would duplicate `own`. The leg is drawn as a Polyline; the camera frames the endpoints only.
 */
export function selectDriverMapCamera({ own, legEnd }: DriverMapCameraInput): LatLng[] {
  return [own, legEnd].filter((p): p is LatLng => p != null)
}

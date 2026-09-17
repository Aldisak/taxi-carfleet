import type { LatLng } from '../shell/mapCamera'
import type { SelectedPlace } from './orderFlowState'

/**
 * Pure camera-point derivation for the customer map-order flow (UC-015 WI-1).
 *
 * Given the current pickup and optional destination, returns the `points: LatLng[]` that the
 * shell's CameraController feeds into `mapCamera.cameraIntent` — 0 points → no move, 1 point →
 * setView, ≥2 points → fitBounds. It imports nothing from leaflet (only the `LatLng` type), so
 * it stays eager-safe like mapCamera.ts. The page NEVER re-derives setView vs fitBounds — that
 * decision lives in mapCamera.cameraIntent; this module only picks which points matter.
 */
export function orderCameraPoints(
  pickup: SelectedPlace | null,
  destination: SelectedPlace | null,
): LatLng[] {
  const points: LatLng[] = []
  if (pickup) points.push({ lat: pickup.lat, lng: pickup.lng })
  if (destination) points.push({ lat: destination.lat, lng: destination.lng })
  return points
}

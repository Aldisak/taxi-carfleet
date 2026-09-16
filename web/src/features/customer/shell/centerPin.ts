/**
 * Pure center-pin / GPS decision logic for the customer map shell (UC-014 WI-4).
 *
 * This module holds ONLY decision logic — it never touches `navigator.geolocation`,
 * `navigator.permissions`, or Leaflet. The actual browser-permission requests and the
 * Leaflet `moveend` wiring live in the WI-2 lazy map component / its UC-015 consumers,
 * which feed their observed values into these pure functions (keeps leaflet lazy and
 * makes the decisions unit-testable per rules/web-architecture.md#pure-logic-modules).
 */

/** A WGS84 coordinate pair. */
export interface LatLng {
  lat: number
  lng: number
}

/**
 * Resolved geolocation-permission state, as reported by the consumer that owns the
 * `navigator.permissions` / `navigator.geolocation` calls.
 * - `granted`     — permission granted; GPS coords may be used once they arrive.
 * - `denied`      — the user refused; fall back to the fleet config center.
 * - `unavailable` — geolocation is not supported / errored; fall back to config center.
 * - `prompt`      — not yet resolved (still asking or loading); use config center meanwhile.
 */
export type GeoPermissionState = 'granted' | 'denied' | 'unavailable' | 'prompt'

/**
 * Decides which point the map should center on initially.
 * The GPS coords are only used when permission is `granted` AND coords have actually
 * arrived; every other state (denied/unavailable/prompt, or granted-but-no-fix-yet)
 * falls back to the fleet config center so the map is never blank.
 */
export function resolveCenterSource(
  permission: GeoPermissionState,
  gps: LatLng | null,
  configCenter: LatLng,
): LatLng {
  if (permission === 'granted' && gps !== null) {
    return gps
  }
  return configCenter
}

/** A debouncer that emits the last-pushed coords once movement settles. */
export interface MoveendDebouncer {
  /** Record a new candidate center (e.g. on each Leaflet `moveend`). */
  push: (coords: LatLng) => void
  /** Cancel a pending emit (e.g. on unmount). */
  cancel: () => void
}

/**
 * Creates a debouncer for map `moveend` coordinates: only the coords that are still
 * the latest after `delayMs` of quiet are handed to `emit`. This avoids a reverse-geocode
 * call for every intermediate frame while the user drags/zooms the map. Mirrors the
 * useSuggest setTimeout debounce precedent; "pure" here means no navigator/Leaflet deps.
 */
export function createMoveendDebouncer(
  delayMs: number,
  emit: (coords: LatLng) => void,
): MoveendDebouncer {
  let timer: ReturnType<typeof setTimeout> | undefined

  const cancel = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
  }

  return {
    push(coords: LatLng): void {
      cancel()
      timer = setTimeout(() => {
        timer = undefined
        emit(coords)
      }, delayMs)
    },
    cancel,
  }
}

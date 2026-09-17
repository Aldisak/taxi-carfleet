import type { LatLng } from './trackingMarker'

/**
 * Pure smooth-marker interpolation math for the customer live tracking map (UC-016 WI-1).
 *
 * Imports NOTHING from leaflet/react/DOM — it stays eager-safe like `mapCamera.ts` and
 * `board/markerThrottle.ts`. The per-frame `requestAnimationFrame` tick that consumes this
 * lives in the lazy map component (WI-3); the reduced-motion DOM read (matchMedia) also lives
 * there — this module only takes the already-resolved boolean via {@link shouldAnimate}.
 */

/**
 * Linearly interpolates between `prev` and `next` by `elapsedMs / durationMs`.
 *
 * - `elapsed >= duration` (or `duration <= 0`) → returns exactly `next` (clamped end).
 * - `elapsed <= 0` → returns exactly `prev` (clamped start).
 * - `prev` null/absent → returns `next` (the first fix snaps; no animation from nowhere).
 *
 * The `duration <= 0` and `elapsed >= duration` guards run BEFORE the division so a zero
 * duration never divides by zero.
 */
export function interpolateCoord(
  prev: LatLng | null,
  next: LatLng,
  elapsedMs: number,
  durationMs: number,
): LatLng {
  if (prev == null) return next
  if (durationMs <= 0 || elapsedMs >= durationMs) return next
  if (elapsedMs <= 0) return prev

  const t = elapsedMs / durationMs
  return {
    lat: prev.lat + (next.lat - prev.lat) * t,
    lng: prev.lng + (next.lng - prev.lng) * t,
  }
}

/**
 * Pure reduced-motion decision. Returns false (jump directly, no rAF animation) when the user
 * prefers reduced motion, so the WI-3 caller honors `prefers-reduced-motion` without this
 * module touching the DOM.
 */
export function shouldAnimate(prefersReducedMotion: boolean): boolean {
  return !prefersReducedMotion
}

import type { LatLng } from '../shell/mapCamera'

/**
 * Inputs for the best-suggest-location decision (UC-018 WI-2). All three tiers are nullable; the
 * helper walks them in precedence order and returns the first non-null one, or null.
 */
export interface SuggestLocationInputs {
  /** The current settled map center (the strongest signal — what the user is looking at). */
  mapCenter: LatLng | null
  /** Device GPS location. Designed-in but supplied as null today (no geolocation hook yet). */
  gpsLocation: LatLng | null
  /** The fleet's configured default map center (weakest fallback). */
  configCenter: LatLng | null
}

/** Decimal places the chosen near coordinate is rounded to (~1.1 km — coarse to avoid cache thrash). */
const NEAR_DECIMALS = 2

function round(value: number): number {
  const factor = 10 ** NEAR_DECIMALS
  return Math.round(value * factor) / factor
}

/**
 * Picks the best available `near` location for address suggest ranking, in precedence order:
 * current map center → device GPS → fleet config center; returns null when none is available.
 *
 * The chosen coordinate is rounded to 2 decimals (~1.1 km) INSIDE this helper — deliberately
 * coarser than client.ts roundCoord's 4 decimals (~11 m) — so tiny map nudges keep the same value
 * and the TanStack query key stays stable (no re-query storm on every small pan). Pure: no React,
 * no I/O, no DI (mirrors mapCamera.ts / orderCamera.ts).
 */
export function pickSuggestLocation({ mapCenter, gpsLocation, configCenter }: SuggestLocationInputs): LatLng | null {
  const chosen = mapCenter ?? gpsLocation ?? configCenter
  if (chosen === null) return null
  return { lat: round(chosen.lat), lng: round(chosen.lng) }
}

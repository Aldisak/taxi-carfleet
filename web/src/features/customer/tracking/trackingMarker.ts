/** A lat/lng coordinate pair. */
export interface LatLng {
  lat: number
  lng: number
}

/** Inputs for {@link selectCarMarker}. */
export interface CarMarkerInput {
  /**
   * Live driver position from the position store (authed mode: updated by the SignalR
   * DriverPositionChanged handler in useFleetHub). Null when there is no live entry.
   */
  livePosition: LatLng | null
  /**
   * Fallback position from the loaded tracking DTO (the driver's last-known position on the
   * server; the only source in public-poll mode). Null when the driver has no position.
   */
  fallbackPosition: LatLng | null
}

/**
 * Selects the car marker position (pure, unit-tested). The live store entry (fresh SignalR
 * positions, authed mode) wins; otherwise the DTO's last-known position is used (public poll
 * mode, or before the first live event). Returns null when there is nothing to show — the map
 * then renders only the pickup pin.
 */
export function selectCarMarker({ livePosition, fallbackPosition }: CarMarkerInput): LatLng | null {
  return livePosition ?? fallbackPosition ?? null
}

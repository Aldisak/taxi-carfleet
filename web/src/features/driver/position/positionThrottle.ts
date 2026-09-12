/** Minimum interval between position sends while stationary (ms). */
export const MIN_SEND_INTERVAL_MS = 3000

/** Displacement that forces an early send regardless of the interval (metres). */
export const MIN_DISPLACEMENT_METERS = 25

/** A candidate position to evaluate for sending. */
export interface CandidatePosition {
  lat: number
  lng: number
}

/** The last successfully-sent position with its send timestamp (ms epoch). */
export interface SentPosition {
  lat: number
  lng: number
  at: number
}

const EARTH_RADIUS_M = 6_371_000

/**
 * Pure function: great-circle distance in metres between two lat/lng points (haversine).
 */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number): number => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)))
}

/**
 * Pure decision function: should this candidate position be sent to the hub now?
 *
 * Sends when either boundary is crossed, whichever comes first:
 * - at least {@link MIN_SEND_INTERVAL_MS} (>= 3000ms) have elapsed since the last send, OR
 * - the candidate moved MORE than {@link MIN_DISPLACEMENT_METERS} (strictly > 25m).
 *
 * The first position (no prior send) always sends. The caller is responsible for
 * committing the new "last sent" ONLY after the hub invoke succeeds — a failed send
 * must not advance the clock (so the retry and the 60s stale banner still fire).
 *
 * @param candidate  The freshly observed position.
 * @param lastSent   The last successfully-sent position, or null if none yet.
 * @param now        Current time in ms epoch.
 */
export function shouldSendPosition(
  candidate: CandidatePosition,
  lastSent: SentPosition | null,
  now: number,
): boolean {
  if (lastSent === null) return true
  if (now - lastSent.at >= MIN_SEND_INTERVAL_MS) return true
  const moved = distanceMeters(lastSent.lat, lastSent.lng, candidate.lat, candidate.lng)
  return moved > MIN_DISPLACEMENT_METERS
}

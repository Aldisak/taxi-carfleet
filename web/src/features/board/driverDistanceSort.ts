import type { DriverSummaryDto } from '../../shared/api/client'

const EARTH_RADIUS_KM = 6371

/** Computes the great-circle distance in kilometers using the Haversine formula. */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Sorts drivers for the inline picker:
 * 1. Free drivers first (regardless of position).
 * 2. Within a status group: drivers with a known position before those without.
 * 3. Within drivers that have a position: ascending distance to the pickup point.
 * 4. Null-position drivers sort last (within their status group).
 */
export function sortDriversByDistance(
  drivers: DriverSummaryDto[],
  pickupLat: number,
  pickupLng: number,
): DriverSummaryDto[] {
  return [...drivers].sort((a, b) => {
    const aFree = a.status === 'Free' ? 0 : 1
    const bFree = b.status === 'Free' ? 0 : 1
    if (aFree !== bFree) return aFree - bFree

    const aHasPos = a.lastLat !== null && a.lastLng !== null ? 0 : 1
    const bHasPos = b.lastLat !== null && b.lastLng !== null ? 0 : 1
    if (aHasPos !== bHasPos) return aHasPos - bHasPos

    if (aHasPos === 1) return 0 // both null — tie

    const aDist = haversineKm(a.lastLat!, a.lastLng!, pickupLat, pickupLng)
    const bDist = haversineKm(b.lastLat!, b.lastLng!, pickupLat, pickupLng)
    return aDist - bDist
  })
}

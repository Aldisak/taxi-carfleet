import { describe, it, expect } from 'vitest'
import { haversineKm, sortDriversByDistance } from './driverDistanceSort'
import type { DriverSummaryDto } from '../../shared/api/client'

// Pickup: Kolín train station
const PICKUP_LAT = 50.0271
const PICKUP_LNG = 15.2005

function makeDriver(
  driverId: string,
  status: string,
  lastLat: number | null,
  lastLng: number | null,
): DriverSummaryDto {
  return {
    driverId,
    displayName: `Driver ${driverId}`,
    status,
    currentVehiclePlate: null,
    lastPositionAt: lastLat !== null ? '2026-09-11T10:00:00.000Z' : null,
    lastLat,
    lastLng,
  }
}

describe('haversineKm', () => {
  it('returns 0 for same point', () => {
    expect(haversineKm(50.0271, 15.2005, 50.0271, 15.2005)).toBe(0)
  })

  it('returns known great-circle distance: equator 1° longitude ≈ 111.195 km', () => {
    // 1° of longitude on the equator = Earth circumference / 360 = 6371 * π/180 ≈ 111.195 km
    const dist = haversineKm(0, 0, 0, 1)
    expect(dist).toBeCloseTo(111.195, 1) // within ±0.05 km
  })

  it('returns ~0.53 km between Kolín station and Kolín hospital', () => {
    // Hospital approx: 50.0288, 15.1934
    const dist = haversineKm(50.0271, 15.2005, 50.0288, 15.1934)
    expect(dist).toBeGreaterThan(0.4)
    expect(dist).toBeCloseTo(0.53, 1) // within ±0.05 km
  })
})

describe('sortDriversByDistance — haversine ordering', () => {
  // Ordering flip test: two points at lat 50 where naive lat/lng delta
  // disagrees with the true great-circle distance.
  //
  // At lat 50° the longitude degree is compressed: cos(50°) ≈ 0.643.
  // Driver A is 1° east (same lat) → true ≈ 71.5 km, naive |Δlng| = 1.0
  // Driver B is 0.8° north (same lng) → true ≈ 89.0 km, naive |Δlat| = 0.8
  // Naive sort (Euclidean lat/lng delta) puts B before A.
  // Haversine sort puts A before B because A is actually closer.
  it('haversine correctly sorts A (1° east) before B (0.8° north) at lat 50', () => {
    const refLat = 50.0
    const refLng = 15.0

    // A: same latitude, 1° east → great-circle ≈ 71.5 km, naive delta ≈ 1.0
    const driverA = makeDriver('A', 'Free', refLat, refLng + 1.0)
    // B: 0.8° north, same longitude → great-circle ≈ 89.0 km, naive delta ≈ 0.8
    const driverB = makeDriver('B', 'Free', refLat + 0.8, refLng)

    const dA = haversineKm(refLat, refLng, driverA.lastLat!, driverA.lastLng!)
    const dB = haversineKm(refLat, refLng, driverB.lastLat!, driverB.lastLng!)
    // Verify our assumption: haversine says A < B
    expect(dA).toBeLessThan(dB)

    const sorted = sortDriversByDistance([driverB, driverA], refLat, refLng)
    expect(sorted[0].driverId).toBe('A')
    expect(sorted[1].driverId).toBe('B')
  })
})

describe('sortDriversByDistance', () => {
  it('puts Free drivers before non-Free drivers', () => {
    const freeDriver = makeDriver('free-1', 'Free', 50.03, 15.21)
    const busyDriver = makeDriver('busy-1', 'Busy', 50.027, 15.200)
    const sorted = sortDriversByDistance([busyDriver, freeDriver], PICKUP_LAT, PICKUP_LNG)
    expect(sorted[0].driverId).toBe('free-1')
    expect(sorted[1].driverId).toBe('busy-1')
  })

  it('sorts by distance ascending within same status group', () => {
    const near = makeDriver('near', 'Free', 50.027, 15.201)    // ~100m from pickup
    const far = makeDriver('far', 'Free', 50.100, 15.300)      // much farther
    const sorted = sortDriversByDistance([far, near], PICKUP_LAT, PICKUP_LNG)
    expect(sorted[0].driverId).toBe('near')
    expect(sorted[1].driverId).toBe('far')
  })

  it('places drivers with null position last', () => {
    const withPos = makeDriver('with-pos', 'Free', 50.027, 15.201)
    const noPos = makeDriver('no-pos', 'Free', null, null)
    const sorted = sortDriversByDistance([noPos, withPos], PICKUP_LAT, PICKUP_LNG)
    expect(sorted[0].driverId).toBe('with-pos')
    expect(sorted[1].driverId).toBe('no-pos')
  })

  it('sorts Free with position before Free without position', () => {
    const freeWithPos = makeDriver('free-pos', 'Free', 50.03, 15.21)
    const freeNoPos = makeDriver('free-no-pos', 'Free', null, null)
    const sorted = sortDriversByDistance([freeNoPos, freeWithPos], PICKUP_LAT, PICKUP_LNG)
    expect(sorted[0].driverId).toBe('free-pos')
    expect(sorted[1].driverId).toBe('free-no-pos')
  })

  it('Free no-position before non-Free (free-first rule takes precedence)', () => {
    const freeNoPos = makeDriver('free-no-pos', 'Free', null, null)
    const busyWithPos = makeDriver('busy-pos', 'Busy', 50.027, 15.201)
    const sorted = sortDriversByDistance([busyWithPos, freeNoPos], PICKUP_LAT, PICKUP_LNG)
    expect(sorted[0].driverId).toBe('free-no-pos')
    expect(sorted[1].driverId).toBe('busy-pos')
  })

  it('all null-position drivers sort last, maintaining free-first within null group', () => {
    const freeNoPos = makeDriver('free-null', 'Free', null, null)
    const busyNoPos = makeDriver('busy-null', 'Busy', null, null)
    const sorted = sortDriversByDistance([busyNoPos, freeNoPos], PICKUP_LAT, PICKUP_LNG)
    expect(sorted[0].driverId).toBe('free-null')
    expect(sorted[1].driverId).toBe('busy-null')
  })
})

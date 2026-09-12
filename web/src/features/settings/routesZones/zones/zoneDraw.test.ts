import { describe, it, expect } from 'vitest'
import {
  haversineMeters,
  circleToRequest,
  polygonToRequest,
  type DrawPoint,
} from './zoneDraw'

describe('haversineMeters', () => {
  it('is zero for the same point', () => {
    expect(haversineMeters({ lat: 49.948, lng: 15.268 }, { lat: 49.948, lng: 15.268 })).toBe(0)
  })

  it('computes a plausible distance between Kutná Hora and Kolín (~17 km)', () => {
    // KH (~49.948, 15.268) to Kolín (~50.027, 15.199) is roughly 10 km great-circle.
    const d = haversineMeters({ lat: 49.948, lng: 15.268 }, { lat: 50.027, lng: 15.199 })
    expect(d).toBeGreaterThan(8_000)
    expect(d).toBeLessThan(12_000)
  })

  it('is symmetric', () => {
    const a: DrawPoint = { lat: 49.948, lng: 15.268 }
    const b: DrawPoint = { lat: 50.027, lng: 15.199 }
    expect(haversineMeters(a, b)).toBeCloseTo(haversineMeters(b, a), 5)
  })
})

describe('circleToRequest', () => {
  it('maps a center + a dragged edge point to a Circle CreateZoneRequest (radius = haversine)', () => {
    const center: DrawPoint = { lat: 49.948, lng: 15.268 }
    const edge: DrawPoint = { lat: 49.958, lng: 15.268 } // ~1.1 km north
    const req = circleToRequest('Centrum KH', center, edge, true)

    expect(req.shape).toBe('Circle')
    expect(req.name).toBe('Centrum KH')
    expect(req.centerLat).toBe(49.948)
    expect(req.centerLng).toBe(15.268)
    expect(req.radiusMeters).toBeGreaterThan(1_000)
    expect(req.radiusMeters).toBeLessThan(1_200)
    expect(req.polygon).toBeNull()
    expect(req.isEnabled).toBe(true)
  })

  it('rounds the radius to a whole number of metres', () => {
    const req = circleToRequest('Z', { lat: 50, lng: 15 }, { lat: 50.01, lng: 15 }, false)
    expect(Number.isInteger(req.radiusMeters)).toBe(true)
    expect(req.isEnabled).toBe(false)
  })
})

describe('polygonToRequest', () => {
  const ring: DrawPoint[] = [
    { lat: 49.95, lng: 15.26 },
    { lat: 49.96, lng: 15.27 },
    { lat: 49.94, lng: 15.28 },
  ]

  it('maps a point ring to a Polygon CreateZoneRequest of [lat,lng] pairs', () => {
    const req = polygonToRequest('Pěší zóna', ring, true)
    expect(req.shape).toBe('Polygon')
    expect(req.polygon).toEqual([
      [49.95, 15.26],
      [49.96, 15.27],
      [49.94, 15.28],
    ])
    expect(req.centerLat).toBeNull()
    expect(req.radiusMeters).toBeNull()
    expect(req.isEnabled).toBe(true)
  })

  it('throws for fewer than 3 points (a polygon needs a closed ring)', () => {
    expect(() => polygonToRequest('X', ring.slice(0, 2), true)).toThrow()
  })
})

import { describe, it, expect, vi, afterEach } from 'vitest'
import { interpolateCoord, shouldAnimate } from './markerInterpolation'
import type { LatLng } from './trackingMarker'

const prev: LatLng = { lat: 50.0, lng: 14.0 }
const next: LatLng = { lat: 50.2, lng: 14.4 }

describe('interpolateCoord', () => {
  it('returns the lat/lng midpoint at half the duration', () => {
    const c = interpolateCoord(prev, next, 500, 1000)
    expect(c.lat).toBeCloseTo(50.1, 10)
    expect(c.lng).toBeCloseTo(14.2, 10)
  })

  it('returns exactly next at elapsed === duration', () => {
    expect(interpolateCoord(prev, next, 1000, 1000)).toEqual(next)
  })

  it('returns exactly next when elapsed exceeds duration', () => {
    expect(interpolateCoord(prev, next, 5000, 1000)).toEqual(next)
  })

  it('returns exactly prev at elapsed === 0', () => {
    expect(interpolateCoord(prev, next, 0, 1000)).toEqual(prev)
  })

  it('returns exactly prev when elapsed is negative', () => {
    expect(interpolateCoord(prev, next, -10, 1000)).toEqual(prev)
  })

  it('snaps to next when prev is null (first fix, no animation from nowhere)', () => {
    expect(interpolateCoord(null, next, 500, 1000)).toEqual(next)
  })

  it('returns next when duration is zero (no divide-by-zero)', () => {
    expect(interpolateCoord(prev, next, 0, 0)).toEqual(next)
  })

  it('drives an example tick sequence toward the target (fake timers)', () => {
    vi.useFakeTimers()
    const start = Date.now()
    const duration = 1000
    const seen: number[] = []
    // simulate frames at 0, 250, 500, 1000 ms
    for (const ms of [0, 250, 500, 1000]) {
      vi.setSystemTime(start + ms)
      const elapsed = Date.now() - start
      seen.push(interpolateCoord(prev, next, elapsed, duration).lat)
    }
    expect(seen[0]).toBeCloseTo(50.0, 10)
    expect(seen[1]).toBeCloseTo(50.05, 10)
    expect(seen[2]).toBeCloseTo(50.1, 10)
    expect(seen[3]).toBeCloseTo(50.2, 10)
    // monotonically approaching the target
    expect(seen[3]).toBeGreaterThan(seen[0])
  })
})

describe('shouldAnimate', () => {
  it('does not animate when reduced motion is preferred', () => {
    expect(shouldAnimate(true)).toBe(false)
  })

  it('animates when reduced motion is not preferred', () => {
    expect(shouldAnimate(false)).toBe(true)
  })
})

afterEach(() => {
  vi.useRealTimers()
})

import { describe, it, expect } from 'vitest'
import { shouldSendPosition, distanceMeters, type SentPosition } from './positionThrottle'

describe('distanceMeters', () => {
  it('returns 0 for identical points', () => {
    expect(distanceMeters(50.08, 14.43, 50.08, 14.43)).toBe(0)
  })

  it('computes a realistic distance for ~25m apart', () => {
    // ~25m north at Prague latitude: 25m / 111320 m-per-deg ≈ 0.0002246 deg
    const d = distanceMeters(50.08, 14.43, 50.08 + 0.0002246, 14.43)
    expect(d).toBeGreaterThan(24)
    expect(d).toBeLessThan(26)
  })
})

describe('shouldSendPosition', () => {
  const candidate = { lat: 50.08, lng: 14.43 }

  it('sends the first position when nothing has been sent yet', () => {
    expect(shouldSendPosition(candidate, null, 1000)).toBe(true)
  })

  it('sends when >= 3000ms elapsed since last send (time boundary)', () => {
    const last: SentPosition = { lat: 50.08, lng: 14.43, at: 1000 }
    // exactly 3000ms -> send
    expect(shouldSendPosition(candidate, last, 4000)).toBe(true)
    // just under 3000ms and not moved -> no send
    expect(shouldSendPosition(candidate, last, 3999)).toBe(false)
  })

  it('does NOT send at exactly 25m displacement (strict > boundary)', () => {
    const last: SentPosition = { lat: 50.08, lng: 14.43, at: 1000 }
    // exactly 25m north, only 500ms elapsed -> below both thresholds
    const moved25 = { lat: 50.08 + 0.0002246, lng: 14.43 }
    expect(shouldSendPosition(moved25, last, 1500)).toBe(false)
  })

  it('sends early when moved MORE than 25m even if < 3000ms elapsed', () => {
    const last: SentPosition = { lat: 50.08, lng: 14.43, at: 1000 }
    const movedFar = { lat: 50.08 + 0.0005, lng: 14.43 } // ~55m
    expect(shouldSendPosition(movedFar, last, 1500)).toBe(true)
  })
})

import { describe, it, expect } from 'vitest'
import { computeCountdown, type CountdownResult } from './offerCountdown'

describe('computeCountdown', () => {
  it('returns full remaining seconds when now is well before expiry', () => {
    const expiresAt = new Date('2026-09-12T10:00:30.000Z')
    const now = new Date('2026-09-12T10:00:00.000Z')
    const result = computeCountdown(expiresAt, now, 30)
    expect(result.remainingSeconds).toBe(30)
  })

  it('returns fractional remaining correctly', () => {
    const expiresAt = new Date('2026-09-12T10:00:45.000Z')
    const now = new Date('2026-09-12T10:00:30.000Z')
    const result = computeCountdown(expiresAt, now, 45)
    expect(result.remainingSeconds).toBe(15)
  })

  it('clamps to 0 when past expiry', () => {
    const expiresAt = new Date('2026-09-12T10:00:00.000Z')
    const now = new Date('2026-09-12T10:00:10.000Z')
    const result = computeCountdown(expiresAt, now, 30)
    expect(result.remainingSeconds).toBe(0)
  })

  it('isDismissed is true when remainingSeconds is 0', () => {
    const expiresAt = new Date('2026-09-12T10:00:00.000Z')
    const now = new Date('2026-09-12T10:00:10.000Z')
    const result = computeCountdown(expiresAt, now, 30)
    expect(result.isDismissed).toBe(true)
  })

  it('isDismissed is false when time remains', () => {
    const expiresAt = new Date('2026-09-12T10:00:30.000Z')
    const now = new Date('2026-09-12T10:00:00.000Z')
    const result = computeCountdown(expiresAt, now, 30)
    expect(result.isDismissed).toBe(false)
  })

  it('computes strokeDashoffset based on fraction remaining', () => {
    // At half time (15s remaining of 30s total), offset should be half of circumference
    const expiresAt = new Date('2026-09-12T10:00:30.000Z')
    const now = new Date('2026-09-12T10:00:15.000Z')
    const circumference = 2 * Math.PI * 45 // radius 45
    const result = computeCountdown(expiresAt, now, 30, 45)
    expect(result.strokeDashoffset).toBeCloseTo(circumference * 0.5, 2)
  })

  it('strokeDashoffset is 0 at full time', () => {
    const expiresAt = new Date('2026-09-12T10:00:30.000Z')
    const now = new Date('2026-09-12T10:00:00.000Z')
    const result = computeCountdown(expiresAt, now, 30, 45)
    expect(result.strokeDashoffset).toBeCloseTo(0, 2)
  })

  it('strokeDashoffset is full circumference when expired', () => {
    const expiresAt = new Date('2026-09-12T10:00:00.000Z')
    const now = new Date('2026-09-12T10:00:30.000Z')
    const circumference = 2 * Math.PI * 45
    const result = computeCountdown(expiresAt, now, 30, 45)
    expect(result.strokeDashoffset).toBeCloseTo(circumference, 2)
  })

  it('accepts string ISO dates for expiresAt and now', () => {
    const result = computeCountdown(
      '2026-09-12T10:00:30.000Z',
      '2026-09-12T10:00:00.000Z',
      30,
    )
    expect(result.remainingSeconds).toBe(30)
  })
})

// Ensure type is exported
const _typeCheck: CountdownResult = computeCountdown(
  new Date(),
  new Date(),
  30,
)
void _typeCheck

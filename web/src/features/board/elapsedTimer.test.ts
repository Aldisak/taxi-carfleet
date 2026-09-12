import { describe, it, expect } from 'vitest'
import { getElapsedSeconds, isElapsedRed } from './elapsedTimer'

describe('getElapsedSeconds', () => {
  it('returns 0 when createdAt equals now', () => {
    const now = new Date('2026-09-11T10:00:00.000Z')
    expect(getElapsedSeconds('2026-09-11T10:00:00.000Z', now)).toBe(0)
  })

  it('returns 60 when 1 minute has passed', () => {
    const now = new Date('2026-09-11T10:01:00.000Z')
    expect(getElapsedSeconds('2026-09-11T10:00:00.000Z', now)).toBe(60)
  })

  it('returns 119 at 1 minute 59 seconds', () => {
    const now = new Date('2026-09-11T10:01:59.000Z')
    expect(getElapsedSeconds('2026-09-11T10:00:00.000Z', now)).toBe(119)
  })

  it('returns 120 at exactly 2 minutes', () => {
    const now = new Date('2026-09-11T10:02:00.000Z')
    expect(getElapsedSeconds('2026-09-11T10:00:00.000Z', now)).toBe(120)
  })
})

describe('isElapsedRed', () => {
  it('is false at 0 seconds', () => {
    expect(isElapsedRed(0)).toBe(false)
  })

  it('is false at 119 seconds', () => {
    expect(isElapsedRed(119)).toBe(false)
  })

  it('is true at exactly 120 seconds (2 minutes)', () => {
    expect(isElapsedRed(120)).toBe(true)
  })

  it('is true at 300 seconds', () => {
    expect(isElapsedRed(300)).toBe(true)
  })
})

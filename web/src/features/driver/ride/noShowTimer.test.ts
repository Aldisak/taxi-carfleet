import { describe, it, expect } from 'vitest'
import { computeNoShow, NO_SHOW_DELAY_MS, type NoShowResult } from './noShowTimer'

const MIN_5 = 5 * 60 * 1000 // 5 minutes in ms

describe('computeNoShow', () => {
  it('returns enabled=false when less than 5 min has elapsed', () => {
    const arrivedAt = new Date('2026-09-12T10:00:00.000Z')
    const now = new Date('2026-09-12T10:04:00.000Z') // 4 min later
    const result = computeNoShow(arrivedAt, now)
    expect(result.enabled).toBe(false)
  })

  it('returns enabled=true when exactly 5 min has elapsed', () => {
    const arrivedAt = new Date('2026-09-12T10:00:00.000Z')
    const now = new Date('2026-09-12T10:05:00.000Z') // exactly 5 min
    const result = computeNoShow(arrivedAt, now)
    expect(result.enabled).toBe(true)
  })

  it('returns enabled=true when more than 5 min has elapsed', () => {
    const arrivedAt = new Date('2026-09-12T10:00:00.000Z')
    const now = new Date('2026-09-12T10:10:00.000Z') // 10 min
    const result = computeNoShow(arrivedAt, now)
    expect(result.enabled).toBe(true)
  })

  it('returns correct remainingSeconds when not yet enabled', () => {
    const arrivedAt = new Date('2026-09-12T10:00:00.000Z')
    const now = new Date('2026-09-12T10:03:00.000Z') // 3 min elapsed, 2 min remaining
    const result = computeNoShow(arrivedAt, now)
    expect(result.remainingSeconds).toBe(120) // 2 min = 120 s
  })

  it('returns remainingSeconds=0 when enabled', () => {
    const arrivedAt = new Date('2026-09-12T10:00:00.000Z')
    const now = new Date('2026-09-12T10:05:30.000Z') // past 5 min
    const result = computeNoShow(arrivedAt, now)
    expect(result.remainingSeconds).toBe(0)
  })

  it('accepts ISO string dates', () => {
    const result = computeNoShow(
      '2026-09-12T10:00:00.000Z',
      '2026-09-12T10:01:00.000Z',
    )
    expect(result.enabled).toBe(false)
    expect(result.remainingSeconds).toBe(240) // 4 min remaining
  })

  it('exports NO_SHOW_DELAY_MS as 5 minutes', () => {
    expect(NO_SHOW_DELAY_MS).toBe(MIN_5)
  })
})

// Type check
const _typeCheck: NoShowResult = computeNoShow(new Date(), new Date())
void _typeCheck

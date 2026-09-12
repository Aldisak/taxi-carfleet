import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { MIN_LEAD_MINUTES, MAX_LEAD_DAYS, validateScheduledAt, minScheduledAt, maxScheduledAt } from './whenRules'

const NOW = new Date('2026-09-12T12:00:00.000Z').getTime()

describe('whenPicker', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('exposes the +20 min and +7 day bounds', () => {
    expect(MIN_LEAD_MINUTES).toBe(20)
    expect(MAX_LEAD_DAYS).toBe(7)
  })

  it('accepts a time exactly at the +20 min minimum', () => {
    const at = new Date(NOW + 20 * 60_000).toISOString()
    expect(validateScheduledAt(at)).toBe('ok')
  })

  it('rejects a time just under the +20 min minimum', () => {
    const at = new Date(NOW + 19 * 60_000).toISOString()
    expect(validateScheduledAt(at)).toBe('tooSoon')
  })

  it('accepts a time exactly at the +7 day maximum', () => {
    const at = new Date(NOW + 7 * 24 * 60 * 60_000).toISOString()
    expect(validateScheduledAt(at)).toBe('ok')
  })

  it('rejects a time beyond the +7 day maximum', () => {
    const at = new Date(NOW + 7 * 24 * 60 * 60_000 + 60_000).toISOString()
    expect(validateScheduledAt(at)).toBe('tooLate')
  })

  it('rejects a malformed date string', () => {
    expect(validateScheduledAt('not-a-date')).toBe('invalid')
  })

  it('minScheduledAt is now + 20 min and maxScheduledAt is now + 7 days', () => {
    expect(minScheduledAt().getTime()).toBe(NOW + 20 * 60_000)
    expect(maxScheduledAt().getTime()).toBe(NOW + 7 * 24 * 60 * 60_000)
  })
})

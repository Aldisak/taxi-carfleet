import { describe, it, expect } from 'vitest'
import { formatPositionAge } from './positionAge'

// Minimal mock t function: interpolates {{n}} with params.n
function mockT(key: string, params?: Record<string, unknown>): string {
  const map: Record<string, string> = {
    'drivers.positionAge.unknown': '—',
    'drivers.positionAge.seconds': 'před {{n}} s',
    'drivers.positionAge.minutes': 'před {{n}} min',
  }
  let tpl = map[key] ?? key
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      tpl = tpl.replace(`{{${k}}}`, String(v))
    }
  }
  return tpl
}

describe('formatPositionAge', () => {
  const nowMs = new Date('2024-01-01T12:00:00Z').getTime()

  it('returns em dash when lastPositionAt is null', () => {
    expect(formatPositionAge(null, nowMs, mockT)).toBe('—')
  })

  it('returns "před 0 s" for 0 seconds ago', () => {
    const at = new Date('2024-01-01T12:00:00Z').toISOString()
    expect(formatPositionAge(at, nowMs, mockT)).toBe('před 0 s')
  })

  it('returns "před 5 s" for 5 seconds ago', () => {
    const at = new Date('2024-01-01T11:59:55Z').toISOString()
    expect(formatPositionAge(at, nowMs, mockT)).toBe('před 5 s')
  })

  it('returns "před 59 s" for 59 seconds ago', () => {
    const at = new Date('2024-01-01T11:59:01Z').toISOString()
    expect(formatPositionAge(at, nowMs, mockT)).toBe('před 59 s')
  })

  it('returns "před 1 min" for 60 seconds ago', () => {
    const at = new Date('2024-01-01T11:59:00Z').toISOString()
    expect(formatPositionAge(at, nowMs, mockT)).toBe('před 1 min')
  })

  it('returns "před 5 min" for 5 minutes ago', () => {
    const at = new Date('2024-01-01T11:55:00Z').toISOString()
    expect(formatPositionAge(at, nowMs, mockT)).toBe('před 5 min')
  })

  it('returns "před 12 s" for 12 seconds ago', () => {
    const at = new Date('2024-01-01T11:59:48Z').toISOString()
    expect(formatPositionAge(at, nowMs, mockT)).toBe('před 12 s')
  })
})

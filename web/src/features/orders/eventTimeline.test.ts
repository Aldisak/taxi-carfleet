import { describe, it, expect } from 'vitest'
import { ALL_ORDER_EVENT_TYPES } from './eventTimeline'
import cs from '../../shared/i18n/cs-CZ.json'
import en from '../../shared/i18n/en-US.json'

// ── Type helpers ──────────────────────────────────────────────────────────────

function getNestedKey(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (current && typeof current === 'object') {
      return (current as Record<string, unknown>)[key]
    }
    return undefined
  }, obj)
}

// ── Key-coverage tests ────────────────────────────────────────────────────────

describe('eventTimeline — i18n key coverage for all 13 OrderEventType values', () => {
  it('all 13 OrderEventType names have keys in cs.json under orders.timeline.event', () => {
    for (const eventType of ALL_ORDER_EVENT_TYPES) {
      const key = `orders.timeline.event.${eventType}`
      const value = getNestedKey(cs as unknown as Record<string, unknown>, key)
      expect(value, `Missing cs.json key: ${key}`).toBeTruthy()
      expect(typeof value).toBe('string')
    }
  })

  it('all 13 OrderEventType names have keys in en.json under orders.timeline.event', () => {
    for (const eventType of ALL_ORDER_EVENT_TYPES) {
      const key = `orders.timeline.event.${eventType}`
      const value = getNestedKey(en as unknown as Record<string, unknown>, key)
      expect(value, `Missing en.json key: ${key}`).toBeTruthy()
      expect(typeof value).toBe('string')
    }
  })

  it('actor roles have keys in cs.json under orders.timeline.actor', () => {
    const actorRoles = ['System', 'Driver', 'Dispatcher', 'Customer']
    for (const role of actorRoles) {
      const key = `orders.timeline.actor.${role}`
      const value = getNestedKey(cs as unknown as Record<string, unknown>, key)
      expect(value, `Missing cs.json key: ${key}`).toBeTruthy()
      expect(typeof value).toBe('string')
    }
  })

  it('actor roles have keys in en.json under orders.timeline.actor', () => {
    const actorRoles = ['System', 'Driver', 'Dispatcher', 'Customer']
    for (const role of actorRoles) {
      const key = `orders.timeline.actor.${role}`
      const value = getNestedKey(en as unknown as Record<string, unknown>, key)
      expect(value, `Missing en.json key: ${key}`).toBeTruthy()
      expect(typeof value).toBe('string')
    }
  })

  it('cs.json and en.json have identical OrderEventType key sets under orders.timeline.event', () => {
    for (const eventType of ALL_ORDER_EVENT_TYPES) {
      const key = `orders.timeline.event.${eventType}`
      const csValue = getNestedKey(cs as unknown as Record<string, unknown>, key)
      const enValue = getNestedKey(en as unknown as Record<string, unknown>, key)
      expect(csValue, `cs.json missing: ${key}`).toBeTruthy()
      expect(enValue, `en.json missing: ${key}`).toBeTruthy()
    }
  })
})

describe('eventTimeline — formatEventTime', () => {
  it('returns relative and absolute time strings', async () => {
    // Import formatEventTime to verify it's still exported after F3 cleanup
    const { formatEventTime } = await import('./eventTimeline')
    const result = formatEventTime(new Date(Date.now() - 30 * 1000).toISOString())
    expect(result.relative).toMatch(/\d/)
    expect(result.absolute).toBeTruthy()
  })
})

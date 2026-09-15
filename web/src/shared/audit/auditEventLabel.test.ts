import { describe, it, expect } from 'vitest'
import { auditEventLabelKey, allLabelledEvents, KNOWN_AUDIT_ACTIONS, ALL_ORDER_EVENT_TYPES } from './auditEventLabel'
import cs from '../i18n/cs-CZ.json'

type Dict = Record<string, unknown>
function resolve(key: string): unknown {
  return key.split('.').reduce<unknown>((acc, part) => (acc as Dict)?.[part], cs)
}

describe('auditEventLabelKey', () => {
  it('maps every order-event type to an existing orders.timeline.event key', () => {
    for (const type of ALL_ORDER_EVENT_TYPES) {
      const key = auditEventLabelKey(type)
      expect(key).toBe(`orders.timeline.event.${type}`)
      expect(typeof resolve(key)).toBe('string')
    }
  })

  it('maps PriceOverridden (price override) to its Czech label key', () => {
    expect(resolve(auditEventLabelKey('PriceOverridden'))).toBe('Cena upravena')
  })

  it('maps every known audit action to an existing audit.event key', () => {
    for (const action of KNOWN_AUDIT_ACTIONS) {
      const key = auditEventLabelKey(action)
      expect(key).toBe(`audit.event.${action}`)
      expect(typeof resolve(key)).toBe('string')
    }
  })

  it('labels the real manual status-override action (StatusOverride)', () => {
    expect(resolve(auditEventLabelKey('StatusOverride'))).toBe('Ruční změna stavu')
  })

  it('falls back to audit.event.Unknown for an unrecognised action (no crash, no raw string)', () => {
    const key = auditEventLabelKey('SomethingBrandNew')
    expect(key).toBe('audit.event.Unknown')
    expect(typeof resolve(key)).toBe('string')
  })

  it('every labelled event resolves to a non-empty Czech string (exhaustiveness)', () => {
    for (const event of allLabelledEvents()) {
      const label = resolve(auditEventLabelKey(event))
      expect(typeof label).toBe('string')
      expect((label as string).length).toBeGreaterThan(0)
    }
  })
})

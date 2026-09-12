import { describe, it, expect } from 'vitest'
import cs from './cs.json'
import en from './en.json'

/**
 * Flattens a nested object to dot-notation keys.
 * e.g. { a: { b: 'c' } } => ['a.b']
 */
function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return flattenKeys(value as Record<string, unknown>, fullKey)
    }
    return [fullKey]
  })
}

describe('locales parity', () => {
  it('cs.json and en.json have identical key sets', () => {
    const csKeys = flattenKeys(cs as unknown as Record<string, unknown>).sort()
    const enKeys = flattenKeys(en as unknown as Record<string, unknown>).sort()

    const missingInEn = csKeys.filter(k => !enKeys.includes(k))
    const missingInCs = enKeys.filter(k => !csKeys.includes(k))

    expect(missingInEn, `Keys in cs.json but not en.json: ${missingInEn.join(', ')}`).toEqual([])
    expect(missingInCs, `Keys in en.json but not cs.json: ${missingInCs.join(', ')}`).toEqual([])
  })
})

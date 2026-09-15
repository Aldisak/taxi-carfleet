import { describe, it, expect } from 'vitest'
import { resources } from './index'
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from './locales'

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

function keysFor(code: string): string[] {
  const bundle = (resources as Record<string, { translation: Record<string, unknown> }>)[code]
  return flattenKeys(bundle.translation).sort()
}

describe('locales parity', () => {
  const baselineKeys = keysFor(DEFAULT_LOCALE)

  it.each(SUPPORTED_LOCALES.filter(l => l.code !== DEFAULT_LOCALE).map(l => l.code))(
    '%s has a key set identical to cs-CZ',
    code => {
      const localeKeys = keysFor(code)

      const missing = baselineKeys.filter(k => !localeKeys.includes(k))
      const extra = localeKeys.filter(k => !baselineKeys.includes(k))

      expect(missing, `Keys in ${DEFAULT_LOCALE} but missing in ${code}: ${missing.join(', ')}`).toEqual([])
      expect(extra, `Keys in ${code} but not in ${DEFAULT_LOCALE}: ${extra.join(', ')}`).toEqual([])
    },
  )
})

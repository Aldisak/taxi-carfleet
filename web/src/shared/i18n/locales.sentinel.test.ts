import { describe, it, expect } from 'vitest'
import { resources } from './index'
import { DEFAULT_LOCALE } from './locales'
import { ENFORCED_LOCALES, SENTINEL_KEYS } from './sentinelKeys'

function resolve(code: string, dotPath: string): unknown {
  const bundle = (resources as Record<string, { translation: Record<string, unknown> }>)[code]
  return dotPath.split('.').reduce<unknown>((acc, key) => {
    if (acc != null && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[key]
    }
    return undefined
  }, bundle.translation)
}

describe('locales sentinel', () => {
  // Empty ENFORCED_LOCALES ⇒ this suite passes vacuously (by design in WI-1).
  // Each language WI appends its code to ENFORCED_LOCALES for an observable RED→GREEN.
  it.each(ENFORCED_LOCALES)('%s translates every sentinel key away from cs-CZ', code => {
    for (const key of SENTINEL_KEYS) {
      const czech = resolve(DEFAULT_LOCALE, key)
      const localized = resolve(code, key)

      expect(localized, `Sentinel key ${key} missing in ${code}`).toBeTruthy()
      expect(
        localized,
        `Sentinel key ${key} in ${code} still equals the cs-CZ value — locale not translated`,
      ).not.toEqual(czech)
    }
  })

  it('has a sentinel test suite wired to ENFORCED_LOCALES', () => {
    // Guards the vacuous case: ensures the arrays exist and are consistent shapes
    // even when ENFORCED_LOCALES is empty, so the file is never a no-op accident.
    expect(Array.isArray(ENFORCED_LOCALES)).toBe(true)
    expect(SENTINEL_KEYS.length).toBe(6)
  })
})

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, sep } from 'node:path'
import { resolveInitialLanguage } from './resolveInitialLanguage'
import { resources } from './index'
import { SUPPORTED_LOCALES } from './locales'

/**
 * AC#8 — extensibility contract.
 *
 * Adding a 7th UI language must be exactly: one `xx-YY.json`, one `SUPPORTED_LOCALES`
 * entry, one import + resources line in `index.ts` — with NO edit to the selector,
 * the parity test, or `resolveInitialLanguage.ts` (all three derive from the registry).
 *
 * This gate scans NON-TEST production source under `web/src` for the FIVE non-default
 * culture-code literals and asserts none leaks outside the small registry whitelist.
 * If a stray `'de-DE'` (etc.) literal appears in a feature/component/hook, the language
 * is being referenced directly instead of via the registry — the scan fails loudly.
 *
 * WHY the flagged set is only FIVE codes (NOT six):
 *   'cs-CZ' is DELIBERATELY EXEMPT. Per the spec's formatting non-goal (§21), money
 *   stays `Kč`/`cs-CZ` and dates stay `Europe/Prague` in EVERY UI language. As a result
 *   'cs-CZ' is spec-MANDATED as a formatting literal in ~30 non-test production files
 *   (`money.ts` `Intl.NumberFormat('cs-CZ')`, TrackingPage, HistoryRow, PlatformScreen,
 *   AuditPage, DriverDrilldown, smsCostDisplay, csvExport, …). Those are CORRECT and MUST
 *   NOT be "fixed". Flagging 'cs-CZ' would make this scan unsatisfiable — so it is exempt.
 *
 * WHY these files are whitelisted:
 *   - `locales.ts`              — THE registry; it enumerates every culture code by design.
 *   - `index.ts`               — builds the i18n `resources` map from the six JSON imports;
 *                                enumerates codes by design.
 *   - `sentinelKeys.ts`        — hand-maintained `ENFORCED_LOCALES` registry (which locales
 *                                are translation-enforced); same category as the registry.
 *                                (Populated by WI-3..6 after the WI-8 whitelist was drafted;
 *                                whitelisted here as the fifth registry file — see handoff notes.)
 *   - `resolveInitialLanguage.ts` — hardcodes exactly one legacy alias (`tl` → `fil-PH`);
 *                                its primary-subtag map is otherwise DERIVED from the registry.
 *                                JSDoc examples there also mention codes; whitelisted whole.
 *   - `shared/date/analyticsRange.ts` — `Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Prague' })`
 *                                is a locale-AGNOSTIC date-parts extractor, NOT a UI-language
 *                                reference. Its 'en-US' is a formatting literal, not a code.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC_ROOT = join(HERE, '..', '..') // web/src

// The five non-default culture codes. 'cs-CZ' is exempt (spec-mandated formatting literal).
const FLAGGED_CODES = SUPPORTED_LOCALES.map(l => l.code).filter(c => c !== 'cs-CZ')

// Files that legitimately enumerate culture codes (the registry + one formatting-literal file).
// Paths are relative to web/src, using POSIX separators.
const WHITELIST = new Set([
  'shared/i18n/locales.ts',
  'shared/i18n/index.ts',
  'shared/i18n/sentinelKeys.ts',
  'shared/i18n/resolveInitialLanguage.ts',
  'shared/date/analyticsRange.ts',
])

/** True for the test/spec files that legitimately name codes and are excluded from the scan. */
function isTestFile(name: string): boolean {
  return /\.test\.[cm]?[jt]sx?$/.test(name) || /\.spec\.[cm]?[jt]sx?$/.test(name)
}

/** Recursively collects non-test `.ts`/`.tsx` files under `dir`, as web/src-relative POSIX paths. */
function collectSourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry)
    if (statSync(abs).isDirectory()) {
      out.push(...collectSourceFiles(abs))
      continue
    }
    if (!/\.[cm]?tsx?$/.test(entry)) continue
    if (isTestFile(entry)) continue
    out.push(relative(SRC_ROOT, abs).split(sep).join('/'))
  }
  return out
}

describe('i18n extensibility (AC#8)', () => {
  it('no non-default culture-code literal leaks into non-test source outside the registry whitelist', () => {
    const files = collectSourceFiles(SRC_ROOT)
    const offenders: string[] = []

    for (const rel of files) {
      if (WHITELIST.has(rel)) continue
      const content = readFileSync(join(SRC_ROOT, rel), 'utf8')
      const hits = FLAGGED_CODES.filter(code => content.includes(code))
      if (hits.length > 0) {
        offenders.push(`${rel} → ${hits.join(', ')}`)
      }
    }

    expect(
      offenders,
      `Stray non-default locale-code literal(s) found outside the registry whitelist. ` +
        `Reference languages via SUPPORTED_LOCALES, not by code:\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  it('scans a real, non-trivial set of source files (guards a broken walk)', () => {
    // If the walk silently returned nothing, the scan above would pass vacuously.
    expect(collectSourceFiles(SRC_ROOT).length).toBeGreaterThan(50)
  })

  it('parity iterates the registry-derived resources map (keys are exactly SUPPORTED_LOCALES)', () => {
    // AC#8 registry-iteration contract, PARITY consumer. The scan above cannot reach
    // locales.parity.test.ts (it's a .test.ts and excluded), so assert here that the
    // resources map parity iterates is exactly the registry — no locale is present in
    // one but absent in the other, so a 7th registry entry + its JSON import is all
    // parity needs. (The SELECTOR consumer is covered by the scan itself:
    // LanguageSelector.tsx is non-test, non-whitelisted source, so hardcoded option
    // literals instead of a SUPPORTED_LOCALES.map would RED the scan above.)
    expect(Object.keys(resources).sort()).toEqual(SUPPORTED_LOCALES.map(l => l.code).sort())
  })

  it('adding a 7th locale auto-detects with no edit to resolveInitialLanguage (registry-derived subtag map)', () => {
    // es-ES is NOT a supported locale, so it must fall back to the default today...
    expect(resolveInitialLanguage(['es-ES'], null)).toBe('cs-CZ')
    // ...but every registered locale's primary subtag resolves without a hardcoded entry,
    // proving the map is derived from SUPPORTED_LOCALES (a 7th locale would work the same way).
    for (const { code } of SUPPORTED_LOCALES) {
      const subtag = code.split('-')[0]
      expect(resolveInitialLanguage([subtag], null)).toBe(code)
    }
  })
})

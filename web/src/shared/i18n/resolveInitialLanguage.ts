import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type LocaleCode } from './locales'

/** Set of supported culture codes, for O(1) exact-match lookup. */
const SUPPORTED_CODES: ReadonlySet<string> = new Set(SUPPORTED_LOCALES.map(l => l.code))

/**
 * Primary-subtag → culture-code map, DERIVED from the registry (`code.split('-')[0]`).
 * A hypothetical 7th locale auto-detects from its subtag with no edit here (AC#8).
 * The only non-derivable entry is the legacy `tl` (Tagalog) alias for Filipino.
 */
const SUBTAG_TO_CODE: ReadonlyMap<string, LocaleCode> = new Map<string, LocaleCode>([
  ...SUPPORTED_LOCALES.map(l => [l.code.split('-')[0], l.code] as const),
  ['tl', 'fil-PH'],
])

/** Narrows a candidate string to a supported `LocaleCode`, or null. */
function asSupported(code: string): LocaleCode | null {
  return SUPPORTED_CODES.has(code) ? (code as LocaleCode) : null
}

/**
 * Resolves the initial UI language, pure and registry-driven.
 *
 * Order: a valid stored value wins; otherwise walk `navigatorLangs` in caller
 * preference order and, per entry, take the first exact culture-code match or
 * primary-subtag match (so `['de','en-US']` → `de-DE`, honoring the user's first
 * preference); finally fall back to `DEFAULT_LOCALE`.
 */
export function resolveInitialLanguage(
  navigatorLangs: readonly string[],
  stored: LocaleCode | null,
): LocaleCode {
  if (stored && SUPPORTED_CODES.has(stored)) return stored

  for (const lang of navigatorLangs) {
    const exact = asSupported(lang)
    if (exact) return exact

    const subtag = lang.split('-')[0].toLowerCase()
    const mapped = SUBTAG_TO_CODE.get(subtag)
    if (mapped) return mapped
  }

  return DEFAULT_LOCALE
}

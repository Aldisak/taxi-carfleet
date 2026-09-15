import { describe, it, expect } from 'vitest'
import { resolveInitialLanguage } from './resolveInitialLanguage'
import { DEFAULT_LOCALE } from './locales'

describe('resolveInitialLanguage', () => {
  it('lets a valid stored language win over navigator', () => {
    expect(resolveInitialLanguage(['de'], 'ru-RU')).toBe('ru-RU')
  })

  it('matches an exact culture code from navigator.languages', () => {
    expect(resolveInitialLanguage(['de-DE'], null)).toBe('de-DE')
  })

  it('matches a primary subtag derived from the registry', () => {
    expect(resolveInitialLanguage(['de'], null)).toBe('de-DE')
    expect(resolveInitialLanguage(['uk'], null)).toBe('uk-UA')
    expect(resolveInitialLanguage(['ru'], null)).toBe('ru-RU')
    expect(resolveInitialLanguage(['en'], null)).toBe('en-US')
    expect(resolveInitialLanguage(['cs'], null)).toBe('cs-CZ')
    expect(resolveInitialLanguage(['fil'], null)).toBe('fil-PH')
  })

  it('honors the tl -> fil-PH legacy Tagalog alias', () => {
    expect(resolveInitialLanguage(['tl'], null)).toBe('fil-PH')
    expect(resolveInitialLanguage(['tl-PH'], null)).toBe('fil-PH')
  })

  it('honors the caller preference order per navigator entry (exact-or-subtag, first hit wins)', () => {
    // 'de' resolves to de-DE before 'en-US' is even considered — the user's first
    // preference wins, matching standard language-detector semantics (AC#8 intent).
    expect(resolveInitialLanguage(['de', 'en-US'], null)).toBe('de-DE')
  })

  it('skips unsupported entries and falls through to a later supported one', () => {
    expect(resolveInitialLanguage(['ja', 'uk-UA'], null)).toBe('uk-UA')
  })

  it('falls back to the default for an unknown language', () => {
    expect(resolveInitialLanguage(['ja'], null)).toBe(DEFAULT_LOCALE)
  })

  it('falls back to the default for an empty navigator list and no stored value', () => {
    expect(resolveInitialLanguage([], null)).toBe(DEFAULT_LOCALE)
  })

  it('ignores an invalid stored value and detects from navigator instead', () => {
    expect(resolveInitialLanguage(['de'], 'xx-YY' as never)).toBe('de-DE')
  })
})

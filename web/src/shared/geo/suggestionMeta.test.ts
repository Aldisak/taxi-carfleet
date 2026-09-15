import { describe, it, expect } from 'vitest'
import { suggestionMeta } from './suggestionMeta'
import type { GeoSuggestItem } from '../api/client'

function item(overrides: Partial<GeoSuggestItem>): GeoSuggestItem {
  return { label: 'Náměstí 1', lat: 50, lng: 15, ...overrides }
}

describe('suggestionMeta', () => {
  it('joins street and municipality with a middot', () => {
    expect(suggestionMeta(item({ street: 'Náměstí', municipality: 'Kolín' }))).toBe('Náměstí · Kolín')
  })

  it('returns just the municipality when there is no street (disambiguates same-named towns)', () => {
    expect(suggestionMeta(item({ street: null, municipality: 'Kutná Hora' }))).toBe('Kutná Hora')
  })

  it('returns just the street when there is no municipality', () => {
    expect(suggestionMeta(item({ street: 'Hlavní', municipality: undefined }))).toBe('Hlavní')
  })

  it('returns null when neither is present (older/flat payload)', () => {
    expect(suggestionMeta(item({}))).toBeNull()
  })

  it('ignores whitespace-only values', () => {
    expect(suggestionMeta(item({ street: '  ', municipality: 'Kolín' }))).toBe('Kolín')
  })
})

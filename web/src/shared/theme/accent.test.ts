import { describe, it, expect } from 'vitest'
import {
  DEFAULT_ACCENT,
  normalizeAccent,
  relativeLuminance,
  onAccent,
  mixHex,
  accentText,
  accentCssVars,
} from './accent'

describe('accent helpers', () => {
  describe('normalizeAccent', () => {
    it('keeps a valid #RRGGBB colour', () => {
      expect(normalizeAccent('#FF8800')).toBe('#FF8800')
    })
    it('falls back to the default for null/malformed input', () => {
      expect(normalizeAccent(null)).toBe(DEFAULT_ACCENT)
      expect(normalizeAccent(undefined)).toBe(DEFAULT_ACCENT)
      expect(normalizeAccent('red')).toBe(DEFAULT_ACCENT)
      expect(normalizeAccent('#FFF')).toBe(DEFAULT_ACCENT)
    })
  })

  describe('relativeLuminance', () => {
    it('is 0 for black and 1 for white', () => {
      expect(relativeLuminance('#000000')).toBeCloseTo(0, 5)
      expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 5)
    })
  })

  describe('onAccent', () => {
    it('uses near-black ink on a bright accent', () => {
      expect(onAccent('#F0B33C')).toBe('#141414') // amber-ish, luminous
      expect(onAccent('#FFFFFF')).toBe('#141414')
    })
    it('uses white on a dark accent', () => {
      expect(onAccent('#0E7A4A')).toBe('#FFFFFF') // default green
      expect(onAccent('#000000')).toBe('#FFFFFF')
    })
  })

  describe('mixHex', () => {
    it('returns endpoint colours at weight 0 and 1', () => {
      expect(mixHex('#000000', '#FFFFFF', 0)).toBe('#000000')
      expect(mixHex('#000000', '#FFFFFF', 1)).toBe('#FFFFFF')
    })
    it('blends halfway', () => {
      expect(mixHex('#000000', '#FFFFFF', 0.5)).toBe('#808080')
    })
  })

  describe('accentText', () => {
    it('returns the raw accent on light surfaces', () => {
      expect(accentText('#0E7A4A', false)).toBe('#0E7A4A')
    })
    it('lightens the accent on dark surfaces', () => {
      const light = accentText('#0E7A4A', true)
      expect(light).not.toBe('#0E7A4A')
      expect(relativeLuminance(light)).toBeGreaterThan(relativeLuminance('#0E7A4A'))
    })
  })

  describe('accentCssVars', () => {
    it('produces the three vars for a fleet colour on a light surface', () => {
      const vars = accentCssVars('#1E5EDC', false)
      expect(vars['--accent']).toBe('#1E5EDC')
      expect(vars['--on-accent']).toBe('#FFFFFF')
      expect(vars['--accent-text']).toBe('#1E5EDC')
    })
    it('falls back to the default accent for a malformed colour', () => {
      const vars = accentCssVars('nope', false)
      expect(vars['--accent']).toBe(DEFAULT_ACCENT)
    })
    it('lightens accent-text in dark mode', () => {
      const vars = accentCssVars('#0E7A4A', true)
      expect(vars['--accent-text']).not.toBe('#0E7A4A')
    })
  })
})

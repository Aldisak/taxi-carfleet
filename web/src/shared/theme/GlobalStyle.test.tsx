import { describe, it, expect } from 'vitest'
import { globalCss } from './GlobalStyle'

/**
 * The design tokens are the deliverable of the redesign foundation; a regression in the
 * CSS-var set (a dropped token, a broken dark block, a missing font-face) would silently
 * degrade every screen. We assert on the exported source string — robust against jsdom's
 * lossy CSSOM round-tripping of custom properties.
 */
describe('globalCss', () => {
  it('declares the self-hosted variable Manrope font face', () => {
    expect(globalCss).toContain('@font-face')
    expect(globalCss).toContain("font-family: 'Manrope'")
    // Single variable file (Latin + latin-ext + Cyrillic), not per-weight/per-subset splits.
    expect(globalCss).toContain('Manrope-var.woff2')
    expect(globalCss).toContain('font-weight: 500 800')
    expect(globalCss).toContain('font-display: swap')
    // Guard against regressing to the old split-subset approach.
    expect(globalCss).not.toContain('fonts.googleapis')
    expect(globalCss).not.toContain('@fontsource')
  })

  it('declares the light-theme ground, ink and accent tokens on :root', () => {
    expect(globalCss).toContain('--bg: #F3F3F1')
    expect(globalCss).toContain('--surface: #FFFFFF')
    expect(globalCss).toContain('--ink: #141414')
    expect(globalCss).toContain('--accent: #0E7A4A')
    expect(globalCss).toContain('--on-accent: #FFFFFF')
    expect(globalCss).toContain('--r-md: 14px')
    expect(globalCss).toContain('--shadow-sheet')
  })

  it('declares the dark-theme override block', () => {
    expect(globalCss).toContain("[data-theme='dark']")
    expect(globalCss).toContain('--bg: #0E0E0E')
    expect(globalCss).toContain('--ink: #F4F4F1')
  })

  it('applies a minimal reset and a visible focus ring', () => {
    expect(globalCss).toContain('box-sizing: border-box')
    expect(globalCss).toContain('margin: 0')
    expect(globalCss).toContain(':focus-visible')
    expect(globalCss).toContain('var(--accent)')
  })

  it('honours prefers-reduced-motion globally', () => {
    expect(globalCss).toContain('prefers-reduced-motion')
  })
})

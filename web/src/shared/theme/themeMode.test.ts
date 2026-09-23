import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  THEME_MODE_KEY,
  readThemeMode,
  writeThemeMode,
  resolveTheme,
  applyTheme,
} from './themeMode'

function mockMatchMedia(prefersDark: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: prefersDark && query.includes('dark'),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
}

describe('themeMode', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('defaults to system when unset', () => {
    expect(readThemeMode()).toBe('system')
  })

  it('round-trips a persisted override', () => {
    writeThemeMode('dark')
    expect(localStorage.getItem(THEME_MODE_KEY)).toBe('dark')
    expect(readThemeMode()).toBe('dark')
  })

  it('ignores an invalid stored value', () => {
    localStorage.setItem(THEME_MODE_KEY, 'neon')
    expect(readThemeMode()).toBe('system')
  })

  it('resolves explicit modes without consulting the OS', () => {
    expect(resolveTheme('light')).toBe('light')
    expect(resolveTheme('dark')).toBe('dark')
  })

  it('resolves system from prefers-color-scheme', () => {
    mockMatchMedia(true)
    expect(resolveTheme('system')).toBe('dark')
    mockMatchMedia(false)
    expect(resolveTheme('system')).toBe('light')
  })

  it('applies the resolved theme to the document root', () => {
    applyTheme('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    applyTheme('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })
})

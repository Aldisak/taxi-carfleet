import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { THEME_MODE_KEY } from './themeMode'
import { useThemeMode } from './useThemeMode'

function mockMatchMedia(prefersDark: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: prefersDark && query.includes('dark'),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
}

describe('useThemeMode', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    mockMatchMedia(false)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('applies the stored mode to the document root on mount', () => {
    localStorage.setItem(THEME_MODE_KEY, 'dark')
    renderHook(() => useThemeMode())
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('defaults to the system (light) theme when unset', () => {
    const { result } = renderHook(() => useThemeMode())
    expect(result.current.mode).toBe('system')
    expect(result.current.resolved).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('persists and applies a new override when setMode is called', () => {
    const { result } = renderHook(() => useThemeMode())
    act(() => result.current.setMode('dark'))
    expect(result.current.mode).toBe('dark')
    expect(result.current.resolved).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem(THEME_MODE_KEY)).toBe('dark')
  })
})

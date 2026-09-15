import { describe, it, expect, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import i18n from './index'
import { useLanguage } from './useLanguage'
import * as languageStorage from './languageStorage'

describe('useLanguage', () => {
  afterEach(async () => {
    // Restore the Czech unit-test baseline for the rest of the suite.
    await i18n.changeLanguage('cs-CZ')
    document.documentElement.lang = 'cs-CZ'
    vi.restoreAllMocks()
  })

  it('exposes the current i18n language', () => {
    const { result } = renderHook(() => useLanguage())
    expect(result.current.current).toBe(i18n.language)
  })

  it('switches i18n, persists, and sets <html lang> on setLanguage', async () => {
    const setStored = vi.spyOn(languageStorage, 'setStoredLanguage')
    const { result } = renderHook(() => useLanguage())

    await act(async () => {
      await result.current.setLanguage('de-DE')
    })

    expect(i18n.language).toBe('de-DE')
    expect(setStored).toHaveBeenCalledWith('de-DE')
    expect(document.documentElement.lang).toBe('de-DE')
    expect(result.current.current).toBe('de-DE')
  })
})

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getStoredLanguage, setStoredLanguage } from './languageStorage'

const KEY = 'app.language'

describe('languageStorage', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })
  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('round-trips a supported language', () => {
    setStoredLanguage('de-DE')
    expect(getStoredLanguage()).toBe('de-DE')
  })

  it('returns null when nothing is stored', () => {
    expect(getStoredLanguage()).toBeNull()
  })

  it('ignores an unsupported stored value and returns null', () => {
    localStorage.setItem(KEY, 'xx-YY')
    expect(getStoredLanguage()).toBeNull()
  })

  it('returns null safely when getItem throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })
    expect(getStoredLanguage()).toBeNull()
  })

  it('does not throw when setItem throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    expect(() => setStoredLanguage('ru-RU')).not.toThrow()
  })
})

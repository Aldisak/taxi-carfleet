import { useTranslation } from 'react-i18next'
import { setStoredLanguage } from './languageStorage'
import type { LocaleCode } from './locales'

/** The active UI language plus a switcher. */
export interface UseLanguage {
  /** The currently active culture code (tracks `i18n.language`). */
  current: string
  /** Switches the UI language: changes i18n, persists, and updates `<html lang>`. */
  setLanguage: (code: LocaleCode) => Promise<void>
}

/**
 * Reads and switches the UI language. `current` re-renders consumers on change
 * (react-i18next); `setLanguage` changes i18n (re-rendering every `t()` consumer
 * with no reload), persists the choice, and reflects it on `<html lang>` (AC#5).
 */
export function useLanguage(): UseLanguage {
  const { i18n } = useTranslation()

  const setLanguage = async (code: LocaleCode): Promise<void> => {
    await i18n.changeLanguage(code)
    setStoredLanguage(code)
    document.documentElement.lang = code
  }

  return { current: i18n.language, setLanguage }
}

import i18n from './index'
import { getStoredLanguage } from './languageStorage'
import { resolveInitialLanguage } from './resolveInitialLanguage'

/**
 * One-time startup language application. Reads the persisted preference and the
 * browser's `navigator.languages`, resolves the initial UI language (AC#3), then
 * switches i18n and sets `<html lang>` (AC#5).
 *
 * Called ONCE from `main.tsx` only — never from `index.ts`, which keeps a static
 * `lng: DEFAULT_LOCALE` so the ~1,464 existing unit tests stay in Czech.
 */
export function applyInitialLanguage(): void {
  const navigatorLangs = navigator.languages ?? [navigator.language].filter(Boolean)
  const code = resolveInitialLanguage(navigatorLangs, getStoredLanguage())
  void i18n.changeLanguage(code)
  document.documentElement.lang = code
}

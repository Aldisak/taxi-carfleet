import { SUPPORTED_LOCALES, type LocaleCode } from './locales'

/**
 * localStorage-backed UI-language preference. Key `app.language` — deliberately
 * NOT in `authStorage`, so the chosen language survives logout (a device
 * preference, not a session token). Mirrors the driverSettings.ts try/catch
 * pattern: every access swallows storage errors (private mode, quota, disabled).
 */
const LANGUAGE_KEY = 'app.language'

/** True when `code` is one of the registry's supported culture codes. */
function isSupported(code: string): code is LocaleCode {
  return SUPPORTED_LOCALES.some(l => l.code === code)
}

/**
 * Returns the stored UI language when present and still supported, else null.
 * An unsupported/legacy value (e.g. a dropped locale) is treated as absent.
 */
export function getStoredLanguage(): LocaleCode | null {
  try {
    const value = localStorage.getItem(LANGUAGE_KEY)
    if (value !== null && isSupported(value)) return value
  } catch {
    // ignore storage errors
  }
  return null
}

/** Persists the chosen UI language. Storage errors are swallowed. */
export function setStoredLanguage(code: LocaleCode): void {
  try {
    localStorage.setItem(LANGUAGE_KEY, code)
  } catch {
    // ignore storage errors
  }
}

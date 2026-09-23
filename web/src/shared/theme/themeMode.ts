/**
 * Light/dark theme-mode resolution and persistence (customer-app redesign).
 *
 * The user override is stored under a single localStorage key (the same place the app keeps the
 * language preference — both are UI-chrome preferences). `system` (the default) follows
 * `prefers-color-scheme`. The resolved mode is applied as `document.documentElement`'s
 * `data-theme` attribute, which flips the dark CSS-var block in GlobalStyle — no React re-render.
 */
export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

/** localStorage key for the persisted theme-mode override. */
export const THEME_MODE_KEY = 'customer-theme-mode'

const MODES: readonly ThemeMode[] = ['light', 'dark', 'system']

/** Reads the persisted mode, defaulting to `system` when unset or invalid. */
export function readThemeMode(): ThemeMode {
  try {
    const raw = localStorage.getItem(THEME_MODE_KEY)
    return MODES.includes(raw as ThemeMode) ? (raw as ThemeMode) : 'system'
  } catch {
    return 'system'
  }
}

/** Persists the mode override (best-effort; ignores storage failures). */
export function writeThemeMode(mode: ThemeMode): void {
  try {
    localStorage.setItem(THEME_MODE_KEY, mode)
  } catch {
    // Private mode / storage disabled — the in-memory mode still applies for the session.
  }
}

/** True when the OS currently prefers a dark colour scheme (false when matchMedia is absent). */
export function systemPrefersDark(): boolean {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: dark)').matches
}

/** Resolves a mode to a concrete light/dark, consulting the OS for `system`. */
export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === 'system') return systemPrefersDark() ? 'dark' : 'light'
  return mode
}

/** Applies the resolved theme to the document root (`data-theme`), flipping the dark var block. */
export function applyTheme(resolved: ResolvedTheme): void {
  document.documentElement.setAttribute('data-theme', resolved)
}

import { useCallback, useEffect, useState } from 'react'
import {
  applyTheme,
  readThemeMode,
  resolveTheme,
  writeThemeMode,
  type ResolvedTheme,
  type ThemeMode,
} from './themeMode'

/** The theme-mode controller returned by {@link useThemeMode}. */
export interface UseThemeModeResult {
  /** The current mode preference (`light | dark | system`). */
  mode: ThemeMode
  /** The concrete theme currently applied (`light | dark`). */
  resolved: ResolvedTheme
  /** Persists a new mode override and applies it immediately. */
  setMode: (mode: ThemeMode) => void
}

/**
 * Reads, applies and persists the customer theme mode. On mount it applies the stored mode
 * (defaulting to `system`) to the document root; while in `system` mode it also tracks live OS
 * colour-scheme changes. Mount it once on the customer surface (the shell).
 */
export function useThemeMode(): UseThemeModeResult {
  const [mode, setModeState] = useState<ThemeMode>(readThemeMode)
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(readThemeMode()))

  // Apply the resolved theme whenever the mode changes.
  useEffect(() => {
    const next = resolveTheme(mode)
    setResolved(next)
    applyTheme(next)
  }, [mode])

  // While following the system, react to live OS colour-scheme changes.
  useEffect(() => {
    if (mode !== 'system' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (): void => {
      const next = resolveTheme('system')
      setResolved(next)
      applyTheme(next)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [mode])

  const setMode = useCallback((next: ThemeMode) => {
    writeThemeMode(next)
    setModeState(next)
  }, [])

  return { mode, resolved, setMode }
}

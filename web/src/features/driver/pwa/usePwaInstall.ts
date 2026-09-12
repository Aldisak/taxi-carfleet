import { useState, useEffect, useRef } from 'react'

/**
 * BeforeInstallPromptEvent is not in lib.dom.
 * Declared locally per csharp-style rules (avoid global augmentation).
 */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** Result of usePwaInstall hook. */
export interface UsePwaInstallResult {
  /** True when the browser has deferred a PWA install prompt. */
  canInstall: boolean
  /** Triggers the native install prompt. No-op if canInstall is false. */
  triggerInstall: () => Promise<void>
}

/**
 * Captures the `beforeinstallprompt` event to enable a custom install banner.
 * Clears canInstall after the app is installed via `appinstalled`.
 *
 * Dev mode: vite-plugin-pwa has devOptions.enabled=false so this runs but
 * the browser will never fire beforeinstallprompt in dev — canInstall stays false.
 */
export function usePwaInstall(): UsePwaInstallResult {
  const [canInstall, setCanInstall] = useState(false)
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault()
      promptRef.current = e as BeforeInstallPromptEvent
      setCanInstall(true)
    }

    function onAppInstalled() {
      promptRef.current = null
      setCanInstall(false)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
    }
  }, [])

  async function triggerInstall(): Promise<void> {
    if (!promptRef.current) return
    await promptRef.current.prompt()
  }

  return { canInstall, triggerInstall }
}

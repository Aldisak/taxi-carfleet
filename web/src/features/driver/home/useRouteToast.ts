import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

interface ToastState {
  toast?: string
}

/**
 * Reads a one-shot toast i18n key passed via `navigate('/driver', { state: { toast } })`
 * (F-04 "objednávka přeřazena", B-complete "Hotovo ✓"), surfaces it for 2s, and
 * clears the history state so a refresh/back does not replay it.
 *
 * The 2s dismiss timer is keyed on the captured toast value, NOT on the incoming
 * location state: clearing router state re-renders with state=null, and keying the
 * effect on the incoming value would tear the timer down almost immediately (the
 * banner would stick forever). We capture the key once per distinct toast and run
 * an independent timer.
 */
export function useRouteToast(): string | null {
  const location = useLocation()
  const navigate = useNavigate()
  const incoming = (location.state as ToastState | null)?.toast ?? null
  const [toast, setToast] = useState<string | null>(incoming)
  const lastShownRef = useRef<string | null>(null)

  // Capture a newly-arrived toast and clear the router state (one-shot).
  useEffect(() => {
    if (!incoming) return
    setToast(incoming)
    navigate(location.pathname, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming])

  // Independent 2s dismiss timer, armed once per shown toast. The ref is reset when
  // the toast clears so the same key can be shown again on a later navigation.
  useEffect(() => {
    if (!toast) {
      lastShownRef.current = null
      return
    }
    if (toast === lastShownRef.current) return
    lastShownRef.current = toast
    const id = setTimeout(() => setToast(null), 2000)
    return () => clearTimeout(id)
  }, [toast])

  return toast
}

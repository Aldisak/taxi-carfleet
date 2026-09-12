import { useEffect, useRef } from 'react'
import { getSilentMode } from '../settings/driverSettings'

/**
 * Plays a repeating alert sound and triggers vibration while an offer is showing.
 * Both are feature-detected and no-op when unavailable (jsdom, iOS locked screen, etc.).
 * Gated by the driver "Tichý režim" silent mode setting (default OFF).
 *
 * @param isActive  True while the offer takeover is visible.
 */
export function useOfferSound(isActive: boolean): void {
  const sourceRef = useRef<OscillatorNode | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const beepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const vibrateIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  /** True once vibration was ever started — guards the stop(0) call. */
  const vibrateStartedRef = useRef(false)

  useEffect(() => {
    if (!isActive || getSilentMode()) {
      stopAll()
      return
    }

    // ── WebAudio beep loop ─────────────────────────────────────────────────
    try {
      // Feature-detect AudioContext
      const AudioContextClass =
        (typeof window !== 'undefined' &&
          (window.AudioContext ??
            (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext))
      if (AudioContextClass) {
        const ctx = new AudioContextClass()
        ctxRef.current = ctx

        function playBeep() {
          if (!ctxRef.current) return
          const osc = ctxRef.current.createOscillator()
          const gain = ctxRef.current.createGain()
          osc.connect(gain)
          gain.connect(ctxRef.current.destination)
          osc.frequency.value = 880
          gain.gain.setValueAtTime(0.3, ctxRef.current.currentTime)
          gain.gain.exponentialRampToValueAtTime(0.0001, ctxRef.current.currentTime + 0.4)
          osc.start(ctxRef.current.currentTime)
          osc.stop(ctxRef.current.currentTime + 0.4)
          sourceRef.current = osc
        }

        playBeep()
        // Repeat every 1.5s
        beepIntervalRef.current = setInterval(playBeep, 1500)
      }
    } catch {
      // AudioContext not available or denied — silent
    }

    // ── Vibration ──────────────────────────────────────────────────────────
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        function vibrate() {
          navigator.vibrate?.([200, 100, 200])
        }
        vibrate()
        vibrateStartedRef.current = true
        vibrateIntervalRef.current = setInterval(vibrate, 2000)
      }
    } catch {
      // vibrate not available
    }

    return () => { stopAll() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive])

  function stopAll() {
    if (beepIntervalRef.current != null) {
      clearInterval(beepIntervalRef.current)
      beepIntervalRef.current = null
    }
    if (vibrateIntervalRef.current != null) {
      clearInterval(vibrateIntervalRef.current)
      vibrateIntervalRef.current = null
    }
    try {
      ctxRef.current?.close()
    } catch {
      // ignore
    }
    ctxRef.current = null
    sourceRef.current = null
    if (vibrateStartedRef.current) {
      try {
        navigator.vibrate?.(0)
      } catch {
        // ignore
      }
      vibrateStartedRef.current = false
    }
  }
}

import { getMuted } from '../realtime/useFleetHub'

/**
 * Plays a notification sound using the WebAudio oscillator API.
 * Skips silently when:
 *   - sound is muted (persisted in localStorage)
 *   - AudioContext is unavailable (headless / test environments)
 *
 * Sound types:
 *   - 'new-order': 880 Hz short beep (new App order arrived)
 *   - 'decline': 440 Hz short beep (driver declined / timed out)
 */
export function playNotificationSound(type: 'new-order' | 'decline'): void {
  if (getMuted()) return
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)

    if (type === 'new-order') {
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
      osc.start()
      osc.stop(ctx.currentTime + 0.4)
    } else {
      // decline: lower pitch
      osc.frequency.value = 440
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2)
      osc.start()
      osc.stop(ctx.currentTime + 0.2)
    }
  } catch {
    // AudioContext may be blocked in tests / headless — ignore
  }
}

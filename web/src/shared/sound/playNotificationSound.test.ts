import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setMuted } from '../realtime/useFleetHub'

describe('playNotificationSound — mute gate', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not create AudioContext when muted', async () => {
    setMuted(true)
    const { playNotificationSound } = await import('./playNotificationSound')

    // Mock AudioContext to detect if it's instantiated
    const AudioContextSpy = vi.fn()
    const originalAudioContext = globalThis.AudioContext
    globalThis.AudioContext = AudioContextSpy as unknown as typeof AudioContext

    playNotificationSound('new-order')

    expect(AudioContextSpy).not.toHaveBeenCalled()

    globalThis.AudioContext = originalAudioContext
  })

  it('attempts to create AudioContext when not muted (may throw in headless)', async () => {
    setMuted(false)
    const { playNotificationSound } = await import('./playNotificationSound')

    // In headless environment AudioContext is available but may not play sound
    // We just verify the function does not throw
    expect(() => playNotificationSound('new-order')).not.toThrow()
    expect(() => playNotificationSound('decline')).not.toThrow()
  })

  it('ignores AudioContext errors (headless/sandbox)', async () => {
    setMuted(false)
    const { playNotificationSound } = await import('./playNotificationSound')

    // Mock AudioContext to throw
    const originalAudioContext = globalThis.AudioContext
    globalThis.AudioContext = vi.fn().mockImplementation(() => {
      throw new Error('AudioContext not allowed')
    }) as unknown as typeof AudioContext

    // Should not throw even when AudioContext fails
    expect(() => playNotificationSound('new-order')).not.toThrow()

    globalThis.AudioContext = originalAudioContext
  })
})

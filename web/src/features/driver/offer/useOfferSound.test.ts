import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useOfferSound } from './useOfferSound'
import * as driverSettings from '../settings/driverSettings'

describe('useOfferSound', () => {
  let vibrateSpy: ReturnType<typeof vi.fn>
  let mockAudioCtx: {
    createOscillator: ReturnType<typeof vi.fn>
    createGain: ReturnType<typeof vi.fn>
    destination: object
    currentTime: number
    close: ReturnType<typeof vi.fn>
    state: string
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(driverSettings, 'getSilentMode').mockReturnValue(false)

    // Mock navigator.vibrate
    vibrateSpy = vi.fn()
    vi.stubGlobal('navigator', {
      ...navigator,
      vibrate: vibrateSpy,
    })

    // Mock AudioContext
    const mockOsc = {
      connect: vi.fn(),
      frequency: { value: 0 },
      start: vi.fn(),
      stop: vi.fn(),
    }
    const mockGainNode = {
      connect: vi.fn(),
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
    }
    mockAudioCtx = {
      createOscillator: vi.fn().mockReturnValue(mockOsc),
      createGain: vi.fn().mockReturnValue(mockGainNode),
      destination: {},
      currentTime: 0,
      close: vi.fn().mockResolvedValue(undefined),
      state: 'running',
    }
    vi.stubGlobal('AudioContext', vi.fn().mockReturnValue(mockAudioCtx))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('calls navigator.vibrate when active and silent mode is OFF', () => {
    renderHook(() => useOfferSound(true))
    expect(vibrateSpy).toHaveBeenCalledWith([200, 100, 200])
  })

  it('does not call navigator.vibrate when silent mode is ON', () => {
    vi.spyOn(driverSettings, 'getSilentMode').mockReturnValue(true)
    renderHook(() => useOfferSound(true))
    expect(vibrateSpy).not.toHaveBeenCalled()
  })

  it('does not call AudioContext when silent mode is ON', () => {
    vi.spyOn(driverSettings, 'getSilentMode').mockReturnValue(true)
    renderHook(() => useOfferSound(true))
    const MockAudioCtx = vi.mocked(AudioContext as unknown as ReturnType<typeof vi.fn>)
    expect(MockAudioCtx).not.toHaveBeenCalled()
  })

  it('stops vibration on deactivation', () => {
    const { rerender } = renderHook(({ active }: { active: boolean }) => useOfferSound(active), {
      initialProps: { active: true },
    })
    // Deactivate
    act(() => { rerender({ active: false }) })
    // stop vibration (0) or clearInterval should have been called
    expect(vibrateSpy).toHaveBeenCalledWith(0)
  })

  it('repeats vibration every 2s when active', () => {
    renderHook(() => useOfferSound(true))
    expect(vibrateSpy).toHaveBeenCalledTimes(1)

    act(() => { vi.advanceTimersByTime(2000) })
    expect(vibrateSpy).toHaveBeenCalledTimes(2)

    act(() => { vi.advanceTimersByTime(2000) })
    expect(vibrateSpy).toHaveBeenCalledTimes(3)
  })
})

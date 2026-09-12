import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePositionReporting } from './usePositionReporting'
import { useOwnPositionStore } from './useOwnPositionStore'

// Mock the hub invoke seam.
const invokeHub = vi.fn<(method: string, ...args: unknown[]) => Promise<boolean>>()
vi.mock('../../../shared/realtime/useFleetHub', () => ({
  invokeHub: (method: string, ...args: unknown[]) => invokeHub(method, ...args),
}))

interface FakeGeoPosition {
  coords: { latitude: number; longitude: number; heading: number | null; speed: number | null }
}

let watchCb: ((pos: FakeGeoPosition) => void) | null = null
const clearWatch = vi.fn()

function emit(lat: number, lng: number, heading: number | null = null, speed: number | null = null) {
  watchCb?.({ coords: { latitude: lat, longitude: lng, heading, speed } })
}

beforeEach(() => {
  vi.useFakeTimers()
  invokeHub.mockReset().mockResolvedValue(true)
  watchCb = null
  clearWatch.mockReset()
  useOwnPositionStore.setState({ position: null, lastSentAt: null })

  Object.defineProperty(globalThis.navigator, 'geolocation', {
    configurable: true,
    value: {
      watchPosition: vi.fn((cb: (pos: FakeGeoPosition) => void) => {
        watchCb = cb
        return 42
      }),
      clearWatch,
    },
  })
  // vibrate spy
  Object.defineProperty(globalThis.navigator, 'vibrate', {
    configurable: true,
    value: vi.fn(() => true),
  })
})

afterEach(() => {
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('usePositionReporting', () => {
  it('does not watch when disabled (offline)', () => {
    renderHook(() => usePositionReporting(false))
    expect(navigator.geolocation.watchPosition).not.toHaveBeenCalled()
  })

  it('invokes UpdatePosition on the hub with lat/lng/heading/speed when enabled', async () => {
    renderHook(() => usePositionReporting(true))
    expect(navigator.geolocation.watchPosition).toHaveBeenCalled()

    await act(async () => {
      emit(50.08, 14.43, 90, 12)
      await Promise.resolve()
    })

    expect(invokeHub).toHaveBeenCalledWith('UpdatePosition', 50.08, 14.43, 90, 12)
  })

  it('throttles: a second fix < 3s with no movement is NOT sent', async () => {
    renderHook(() => usePositionReporting(true))
    await act(async () => { emit(50.08, 14.43); await Promise.resolve() })
    expect(invokeHub).toHaveBeenCalledTimes(1)

    await act(async () => {
      vi.advanceTimersByTime(1000)
      emit(50.08, 14.43)
      await Promise.resolve()
    })
    expect(invokeHub).toHaveBeenCalledTimes(1)
  })

  it('sends again after 3s elapsed', async () => {
    renderHook(() => usePositionReporting(true))
    await act(async () => { emit(50.08, 14.43); await Promise.resolve() })

    await act(async () => {
      vi.advanceTimersByTime(3000)
      emit(50.08, 14.43)
      await Promise.resolve()
    })
    expect(invokeHub).toHaveBeenCalledTimes(2)
  })

  it('a failed send does NOT advance the clock (retry still fires)', async () => {
    renderHook(() => usePositionReporting(true))
    invokeHub.mockResolvedValueOnce(false) // hub not connected

    await act(async () => { emit(50.08, 14.43); await Promise.resolve() })
    expect(invokeHub).toHaveBeenCalledTimes(1)

    // Next fix 1s later, no movement — because the first did NOT succeed, lastSent is still null,
    // so it sends again immediately.
    await act(async () => {
      vi.advanceTimersByTime(1000)
      emit(50.08, 14.43)
      await Promise.resolve()
    })
    expect(invokeHub).toHaveBeenCalledTimes(2)
  })

  it('shows the stale banner and vibrates once after 60s with no successful send', async () => {
    const { result } = renderHook(() => usePositionReporting(true))
    // No successful send ever (hub disconnected)
    invokeHub.mockResolvedValue(false)
    await act(async () => { emit(50.08, 14.43); await Promise.resolve() })
    expect(result.current.stale).toBe(false)

    await act(async () => {
      vi.advanceTimersByTime(60_000)
      await Promise.resolve()
    })
    expect(result.current.stale).toBe(true)
    expect(navigator.vibrate).toHaveBeenCalledTimes(1)

    // Still stale 10s later — vibrate is NOT repeated (arm-once).
    await act(async () => {
      vi.advanceTimersByTime(10_000)
      await Promise.resolve()
    })
    expect(navigator.vibrate).toHaveBeenCalledTimes(1)
  })

  it('clears stale after a successful send resumes', async () => {
    const { result } = renderHook(() => usePositionReporting(true))
    invokeHub.mockResolvedValue(false)
    await act(async () => { emit(50.08, 14.43); await Promise.resolve() })
    await act(async () => { vi.advanceTimersByTime(60_000); await Promise.resolve() })
    expect(result.current.stale).toBe(true)

    invokeHub.mockResolvedValue(true)
    await act(async () => {
      vi.advanceTimersByTime(3000)
      emit(50.08, 14.43)
      await Promise.resolve()
    })
    expect(result.current.stale).toBe(false)
  })

  it('updates the own-position store on each fix', async () => {
    renderHook(() => usePositionReporting(true))
    await act(async () => { emit(50.08, 14.43, 45, 5); await Promise.resolve() })
    expect(useOwnPositionStore.getState().position).toEqual({ lat: 50.08, lng: 14.43, heading: 45, speed: 5 })
  })
})

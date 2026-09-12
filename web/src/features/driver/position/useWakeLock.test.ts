import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useWakeLock } from './useWakeLock'

const release = vi.fn<() => Promise<void>>()
const request = vi.fn<() => Promise<{ release: () => Promise<void>; addEventListener: () => void }>>()

beforeEach(() => {
  release.mockReset().mockResolvedValue(undefined)
  request.mockReset().mockResolvedValue({ release, addEventListener: vi.fn() })
})

afterEach(() => {
  // @ts-expect-error cleanup test double
  delete globalThis.navigator.wakeLock
  vi.clearAllMocks()
})

describe('useWakeLock', () => {
  it('no-ops when navigator.wakeLock is undefined', () => {
    expect(() => renderHook(() => useWakeLock(true))).not.toThrow()
  })

  it('requests a screen wake lock when enabled and supported', async () => {
    Object.defineProperty(globalThis.navigator, 'wakeLock', {
      configurable: true,
      value: { request },
    })
    renderHook(() => useWakeLock(true))
    await Promise.resolve()
    expect(request).toHaveBeenCalledWith('screen')
  })

  it('does not request when disabled', async () => {
    Object.defineProperty(globalThis.navigator, 'wakeLock', {
      configurable: true,
      value: { request },
    })
    renderHook(() => useWakeLock(false))
    await Promise.resolve()
    expect(request).not.toHaveBeenCalled()
  })

  it('releases the lock on unmount', async () => {
    Object.defineProperty(globalThis.navigator, 'wakeLock', {
      configurable: true,
      value: { request },
    })
    const { unmount } = renderHook(() => useWakeLock(true))
    await Promise.resolve()
    unmount()
    await Promise.resolve()
    expect(release).toHaveBeenCalled()
  })
})

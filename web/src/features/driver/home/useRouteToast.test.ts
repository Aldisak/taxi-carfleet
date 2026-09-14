import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const mockLocation = { pathname: '/driver', state: null as unknown }
// Reproduce the real router behavior: navigate({ state: null }) clears location.state.
const mockNavigate = vi.fn((_path: string, opts?: { state?: unknown }) => {
  mockLocation.state = opts?.state ?? null
})
vi.mock('react-router-dom', () => ({
  useLocation: () => mockLocation,
  useNavigate: () => mockNavigate,
}))

import { useRouteToast } from './useRouteToast'

describe('useRouteToast', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    mockLocation.state = null
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns null when there is no toast in location state', () => {
    const { result } = renderHook(() => useRouteToast())
    expect(result.current).toBeNull()
  })

  it('surfaces the toast i18n key from location.state and clears the history state', () => {
    mockLocation.state = { toast: 'driver.ride.reassigned' }
    const { result } = renderHook(() => useRouteToast())
    expect(result.current).toBe('driver.ride.reassigned')
    // history state cleared so a back/refresh does not re-show it
    expect(mockNavigate).toHaveBeenCalledWith('/driver', { replace: true, state: null })
  })

  it('auto-dismisses after 2 seconds even after the router clears location.state', () => {
    mockLocation.state = { toast: 'driver.complete.successOverlay' }
    const { result, rerender } = renderHook(() => useRouteToast())
    expect(result.current).toBe('driver.complete.successOverlay')
    // The effect already cleared location.state via navigate(); a subsequent router
    // re-render now delivers state=null. The 2s dismiss timer must survive this.
    rerender()
    expect(result.current).toBe('driver.complete.successOverlay')
    act(() => { vi.advanceTimersByTime(2000) })
    expect(result.current).toBeNull()
  })
})

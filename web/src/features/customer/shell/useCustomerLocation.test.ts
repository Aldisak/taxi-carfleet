import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useCustomerLocation } from './useCustomerLocation'

// A controllable navigator.geolocation stub. getCurrentPosition is driven by the `nextResult`
// switch so each test decides whether the one-shot fix succeeds, is denied, or the API is absent.
type GeoResult = { kind: 'success'; lat: number; lng: number } | { kind: 'error' }
let nextResult: GeoResult = { kind: 'success', lat: 50.08, lng: 14.42 }
const getCurrentPosition = vi.fn(
  (success: PositionCallback, error?: PositionErrorCallback) => {
    if (nextResult.kind === 'success') {
      success({ coords: { latitude: nextResult.lat, longitude: nextResult.lng } } as GeolocationPosition)
    } else {
      error?.({ code: 1, message: 'denied' } as GeolocationPositionError)
    }
  },
)

// A controllable navigator.permissions stub mirroring DriverMapScreen's Permissions API use.
let permissionState: PermissionState = 'granted'
let permissionOnChange: (() => void) | null = null
const permissionsQuery = vi.fn(async () => {
  const status = {
    // Live getter so a later permissionState change is visible when onchange fires (mirrors a
    // real PermissionStatus whose .state reflects the current permission).
    get state() {
      return permissionState
    },
    set onchange(fn: (() => void) | null) {
      permissionOnChange = fn
    },
  }
  return status as unknown as PermissionStatus
})

function stubNavigator({ geolocation = true, permissions = true }: { geolocation?: boolean; permissions?: boolean } = {}) {
  vi.stubGlobal('navigator', {
    geolocation: geolocation ? { getCurrentPosition } : undefined,
    permissions: permissions ? { query: permissionsQuery } : undefined,
  })
}

describe('useCustomerLocation', () => {
  beforeEach(() => {
    getCurrentPosition.mockClear()
    permissionsQuery.mockClear()
    nextResult = { kind: 'success', lat: 50.08, lng: 14.42 }
    permissionState = 'granted'
    permissionOnChange = null
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('resolves to granted with coords when the one-shot fix succeeds', async () => {
    stubNavigator()
    const { result } = renderHook(() => useCustomerLocation())

    await waitFor(() => expect(result.current.status).toBe('granted'))
    expect(result.current.coords).toEqual({ lat: 50.08, lng: 14.42 })
    expect(getCurrentPosition).toHaveBeenCalledTimes(1)
  })

  it('resolves to denied with null coords when the fix errors (permission refused)', async () => {
    stubNavigator()
    nextResult = { kind: 'error' }
    const { result } = renderHook(() => useCustomerLocation())

    await waitFor(() => expect(result.current.status).toBe('denied'))
    expect(result.current.coords).toBeNull()
  })

  it('resolves to unavailable when geolocation is absent from the browser', async () => {
    stubNavigator({ geolocation: false })
    const { result } = renderHook(() => useCustomerLocation())

    await waitFor(() => expect(result.current.status).toBe('unavailable'))
    expect(result.current.coords).toBeNull()
    expect(getCurrentPosition).not.toHaveBeenCalled()
  })

  it('re-requests the fix when request() is called', async () => {
    stubNavigator()
    const { result } = renderHook(() => useCustomerLocation())

    await waitFor(() => expect(result.current.status).toBe('granted'))
    expect(getCurrentPosition).toHaveBeenCalledTimes(1)

    // A second location fix (e.g. the "Use my location" tap) re-queries the browser.
    nextResult = { kind: 'success', lat: 49.95, lng: 15.27 }
    act(() => result.current.request())

    await waitFor(() => expect(result.current.coords).toEqual({ lat: 49.95, lng: 15.27 }))
    expect(getCurrentPosition).toHaveBeenCalledTimes(2)
  })

  it('flips to denied when the Permissions API reports a later revocation (onchange)', async () => {
    stubNavigator()
    const { result } = renderHook(() => useCustomerLocation())

    await waitFor(() => expect(result.current.status).toBe('granted'))
    expect(permissionOnChange).not.toBeNull()

    // The user revokes permission in the browser → the permission status onchange fires.
    permissionState = 'denied'
    act(() => permissionOnChange?.())
    await waitFor(() => expect(result.current.status).toBe('denied'))
  })
})

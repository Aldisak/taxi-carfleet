import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDriverSettings } from './useDriverSettings'
import { getSilentMode, getNavAppPreference } from './driverSettings'

describe('useDriverSettings', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults to silent mode OFF and nav app "geo"', () => {
    const { result } = renderHook(() => useDriverSettings())
    expect(result.current.silentMode).toBe(false)
    expect(result.current.navApp).toBe('geo')
  })

  it('persists silent mode through the shared driverSettings module (same key)', () => {
    const { result } = renderHook(() => useDriverSettings())

    act(() => { result.current.setSilentMode(true) })

    // hook state updated
    expect(result.current.silentMode).toBe(true)
    // written through to the SAME module B-offer's useOfferSound reads
    expect(getSilentMode()).toBe(true)
  })

  it('persists the nav app preference through the shared driverSettings module', () => {
    const { result } = renderHook(() => useDriverSettings())

    act(() => { result.current.setNavApp('waze') })

    expect(result.current.navApp).toBe('waze')
    expect(getNavAppPreference()).toBe('waze')
  })

  it('restores persisted values on a fresh mount (persist + restore round-trip)', () => {
    const first = renderHook(() => useDriverSettings())
    act(() => {
      first.result.current.setSilentMode(true)
      first.result.current.setNavApp('mapy')
    })
    first.unmount()

    // A new hook instance reads back from the shared module
    const second = renderHook(() => useDriverSettings())
    expect(second.result.current.silentMode).toBe(true)
    expect(second.result.current.navApp).toBe('mapy')
  })
})

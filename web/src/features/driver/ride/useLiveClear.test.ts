import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// Mocks before imports
const clearFn = vi.fn()

vi.mock('./useActiveOrderStore', () => ({
  useActiveOrderStore: vi.fn().mockImplementation((selector: (s: unknown) => unknown) => {
    const state = {
      order: { id: 'order-1', driverId: 'driver-1', status: 'Accepted' } as {
        id: string
        driverId: string | null
        status: string
      } | null,
      clear: clearFn,
    }
    return selector(state)
  }),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: vi.fn(() => mockNavigate),
}))

import { useLiveClear } from './useLiveClear'

describe('useLiveClear', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('F-04: DriverStatusChanged with own driverId and status=Free clears and navigates Home', async () => {
    renderHook(() => useLiveClear('driver-1'))

    await act(async () => {
      window.dispatchEvent(new CustomEvent('driver:statusChanged', {
        detail: { driverId: 'driver-1', status: 'Free' },
      }))
    })

    expect(clearFn).toHaveBeenCalled()
    expect(mockNavigate).toHaveBeenCalledWith('/driver', expect.objectContaining({ replace: true }))
  })

  it('F-04: DriverStatusChanged with different driverId is ignored', async () => {
    renderHook(() => useLiveClear('driver-1'))

    await act(async () => {
      window.dispatchEvent(new CustomEvent('driver:statusChanged', {
        detail: { driverId: 'driver-999', status: 'Free' },
      }))
    })

    expect(clearFn).not.toHaveBeenCalled()
  })

  it('F-04: DriverStatusChanged with status Busy (not Free) is ignored', async () => {
    renderHook(() => useLiveClear('driver-1'))

    await act(async () => {
      window.dispatchEvent(new CustomEvent('driver:statusChanged', {
        detail: { driverId: 'driver-1', status: 'Busy' },
      }))
    })

    expect(clearFn).not.toHaveBeenCalled()
  })

  it('F-04: DriverStatusChanged with numeric status 1 (=Free) clears and navigates', async () => {
    renderHook(() => useLiveClear('driver-1'))

    await act(async () => {
      window.dispatchEvent(new CustomEvent('driver:statusChanged', {
        detail: { driverId: 'driver-1', status: 1 }, // numeric Free
      }))
    })

    expect(clearFn).toHaveBeenCalled()
    expect(mockNavigate).toHaveBeenCalledWith('/driver', expect.objectContaining({ replace: true }))
  })

  it('F-04: OrderChanged for active order with different driverId clears and navigates Home', async () => {
    renderHook(() => useLiveClear('driver-1'))

    await act(async () => {
      window.dispatchEvent(new CustomEvent('driver:orderChanged', {
        detail: {
          id: 'order-1',
          driverId: 'driver-2', // reassigned to different driver
          status: 'Accepted',
          version: 2,
        },
      }))
    })

    expect(clearFn).toHaveBeenCalled()
    expect(mockNavigate).toHaveBeenCalledWith('/driver', expect.objectContaining({ replace: true }))
  })

  it('F-04: OrderChanged for a different order is ignored', async () => {
    renderHook(() => useLiveClear('driver-1'))

    await act(async () => {
      window.dispatchEvent(new CustomEvent('driver:orderChanged', {
        detail: {
          id: 'order-999', // different order
          driverId: 'driver-2',
          status: 'Accepted',
          version: 2,
        },
      }))
    })

    expect(clearFn).not.toHaveBeenCalled()
  })

  it('F-04: OrderChanged with same driverId and non-terminal status is ignored', async () => {
    renderHook(() => useLiveClear('driver-1'))

    await act(async () => {
      window.dispatchEvent(new CustomEvent('driver:orderChanged', {
        detail: {
          id: 'order-1',
          driverId: 'driver-1', // still same driver
          status: 'InProgress',
          version: 2,
        },
      }))
    })

    expect(clearFn).not.toHaveBeenCalled()
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'

vi.mock('../../../shared/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../../shared/api/client')>(
    '../../../shared/api/client',
  )
  return { ...actual, getPublicTrack: vi.fn() }
})

import { getPublicTrack, ApiResponseError } from '../../../shared/api/client'
import type { TrackDto } from '../../../shared/api/client'
import { useTrackingPublic } from './useTrackingPublic'

const mockTrack = vi.mocked(getPublicTrack)

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children)
  }
}

const dto: TrackDto = {
  publicCode: 'ABC123',
  status: 'Assigned',
  pickupAddress: 'Hlavní 1',
  dropoffAddress: null,
  scheduledAt: null,
  driverFirstName: 'Petr',
  vehiclePlate: '1AB 2345',
  vehicleColor: 'černá',
  position: { lat: 50.08, lng: 14.42 },
  etaMinutes: null,
  displayPriceCzk: 120,
}

/** Flush pending microtasks + timers so the query settles under fake timers. */
async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
}

describe('useTrackingPublic', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockTrack.mockReset()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('fetches the public track DTO for the code+token', async () => {
    mockTrack.mockResolvedValue(dto)
    const { result } = renderHook(() => useTrackingPublic('ABC123', 'tok'), { wrapper: makeWrapper() })

    await flush()
    expect(result.current.data).toEqual(dto)
    expect(mockTrack).toHaveBeenCalledWith('ABC123', 'tok')
  })

  it('polls again after 10 seconds', async () => {
    mockTrack.mockResolvedValue(dto)
    renderHook(() => useTrackingPublic('ABC123', 'tok'), { wrapper: makeWrapper() })

    await flush()
    expect(mockTrack).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(mockTrack).toHaveBeenCalledTimes(2)
  })

  it('surfaces the expired state on a 410 and stops polling', async () => {
    mockTrack.mockRejectedValue(
      new ApiResponseError(410, {
        status: 410,
        title: 'Gone',
        type: '',
        errors: [{ name: '', reason: '', code: 'Tracking.LinkExpired' }],
      }),
    )
    const { result } = renderHook(() => useTrackingPublic('ABC123', 'tok'), { wrapper: makeWrapper() })

    await flush()
    expect(result.current.isExpired).toBe(true)
    const calls = mockTrack.mock.calls.length
    // No further polling after expiry.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(mockTrack).toHaveBeenCalledTimes(calls)
  })

  it('does not fetch when the token is missing', async () => {
    mockTrack.mockResolvedValue(dto)
    renderHook(() => useTrackingPublic('ABC123', null), { wrapper: makeWrapper() })
    await flush()
    expect(mockTrack).not.toHaveBeenCalled()
  })
})

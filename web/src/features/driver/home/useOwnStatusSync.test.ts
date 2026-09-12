import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import type { GetDriverMeResponse } from '../../../shared/api/client'
import { useOwnStatusSync } from './useOwnStatusSync'

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

const MY_DRIVER_ID = 'driver-abc'
const INITIAL_ME: GetDriverMeResponse = {
  driverId: MY_DRIVER_ID,
  displayName: 'Test Driver',
  status: 'Offline',
  currentVehicleId: null,
  currentVehiclePlate: null,
  lastPositionAt: null,
  currentShiftId: null,
  currentShiftStartedAt: null,
  activeOrderId: null,
}

describe('useOwnStatusSync', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    queryClient.setQueryData(['driver', 'me'], INITIAL_ME)
  })

  it('patches driver:me cache when driver:statusChanged fires with own driverId', async () => {
    const { rerender } = renderHook(
      ({ driverId }: { driverId: string | undefined }) => useOwnStatusSync(driverId),
      { wrapper: createWrapper(queryClient), initialProps: { driverId: MY_DRIVER_ID } },
    )
    void rerender({ driverId: MY_DRIVER_ID })

    act(() => {
      window.dispatchEvent(
        new CustomEvent('driver:statusChanged', {
          detail: { driverId: MY_DRIVER_ID, status: 'Free' },
        }),
      )
    })

    const cached = queryClient.getQueryData<GetDriverMeResponse>(['driver', 'me'])
    expect(cached?.status).toBe('Free')
  })

  it('ignores driver:statusChanged events for other drivers', async () => {
    renderHook(
      () => useOwnStatusSync(MY_DRIVER_ID),
      { wrapper: createWrapper(queryClient) },
    )

    act(() => {
      window.dispatchEvent(
        new CustomEvent('driver:statusChanged', {
          detail: { driverId: 'driver-other', status: 'Busy' },
        }),
      )
    })

    const cached = queryClient.getQueryData<GetDriverMeResponse>(['driver', 'me'])
    expect(cached?.status).toBe('Offline') // unchanged
  })

  it('normalizes numeric status using verified eventReducer mapping (2=EnRoute, 3=Busy)', async () => {
    renderHook(
      () => useOwnStatusSync(MY_DRIVER_ID),
      { wrapper: createWrapper(queryClient) },
    )

    // 2 = EnRoute per eventReducer.ts DRIVER_STATUS_MAP
    act(() => {
      window.dispatchEvent(
        new CustomEvent('driver:statusChanged', {
          detail: { driverId: MY_DRIVER_ID, status: 2 },
        }),
      )
    })

    const cached = queryClient.getQueryData<GetDriverMeResponse>(['driver', 'me'])
    expect(cached?.status).toBe('EnRoute')
  })

  it('normalizes numeric 3 to Busy', async () => {
    renderHook(
      () => useOwnStatusSync(MY_DRIVER_ID),
      { wrapper: createWrapper(queryClient) },
    )

    act(() => {
      window.dispatchEvent(
        new CustomEvent('driver:statusChanged', {
          detail: { driverId: MY_DRIVER_ID, status: 3 },
        }),
      )
    })

    const cached = queryClient.getQueryData<GetDriverMeResponse>(['driver', 'me'])
    expect(cached?.status).toBe('Busy')
  })

  it('does nothing when myDriverId is undefined', async () => {
    renderHook(
      () => useOwnStatusSync(undefined),
      { wrapper: createWrapper(queryClient) },
    )

    act(() => {
      window.dispatchEvent(
        new CustomEvent('driver:statusChanged', {
          detail: { driverId: MY_DRIVER_ID, status: 'Free' },
        }),
      )
    })

    const cached = queryClient.getQueryData<GetDriverMeResponse>(['driver', 'me'])
    expect(cached?.status).toBe('Offline') // unchanged
  })
})

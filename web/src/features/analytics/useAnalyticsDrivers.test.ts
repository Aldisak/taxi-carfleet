/**
 * Unit tests for useAnalyticsDrivers hook.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import type { AnalyticsDriversResponse, AnalyticsDriversParams } from '../../shared/api/client'

vi.mock('../../shared/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../shared/api/client')>('../../shared/api/client')
  return {
    ...actual,
    getAnalyticsDrivers: vi.fn(),
  }
})

import { getAnalyticsDrivers } from '../../shared/api/client'
import { useAnalyticsDrivers } from './useAnalyticsDrivers'

const mockGet = vi.mocked(getAnalyticsDrivers)

const defaultParams: AnalyticsDriversParams = {
  from: '2026-09-01',
  to: '2026-09-07',
  granularity: 'day',
  compare: false,
}

const mockResponse: AnalyticsDriversResponse = {
  drivers: [],
  retention: [],
  prior: null,
}

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children)
}

describe('useAnalyticsDrivers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls getAnalyticsDrivers with the provided params', async () => {
    mockGet.mockResolvedValue(mockResponse)
    const { result } = renderHook(() => useAnalyticsDrivers(defaultParams), {
      wrapper: makeWrapper(),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockGet).toHaveBeenCalledWith(defaultParams)
  })

  it('returns data from the API', async () => {
    const response: AnalyticsDriversResponse = {
      drivers: [
        {
          driverId: 'aaa',
          name: 'Jan Novák',
          ridesCompleted: 5,
          revenueCzk: 2500,
          onlineHours: 4,
          utilizationPct: 60,
          revenuePerOnlineHour: 625,
          acceptanceRate: 80,
          avgTimeToAcceptSeconds: 30,
          declinesAndTimeouts: 1,
          cancellations: 0,
          noShows: 0,
          avgRating: 4.5,
        },
      ],
      retention: [],
      prior: null,
    }
    mockGet.mockResolvedValue(response)
    const { result } = renderHook(() => useAnalyticsDrivers(defaultParams), {
      wrapper: makeWrapper(),
    })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data?.drivers).toHaveLength(1)
  })

  it('uses query key ["analytics", "drivers", params]', async () => {
    mockGet.mockResolvedValue(mockResponse)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children)

    const { result } = renderHook(() => useAnalyticsDrivers(defaultParams), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const cachedData = qc.getQueryData(['analytics', 'drivers', defaultParams])
    expect(cachedData).toEqual(mockResponse)
  })

  it('exposes isError when the fetch fails', async () => {
    mockGet.mockRejectedValue(new Error('network error'))
    const { result } = renderHook(() => useAnalyticsDrivers(defaultParams), {
      wrapper: makeWrapper(),
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

/**
 * Unit tests for useAnalyticsRevenue hook.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import type { AnalyticsRevenueResponse, AnalyticsRevenueParams } from '../../shared/api/client'

vi.mock('../../shared/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../shared/api/client')>('../../shared/api/client')
  return {
    ...actual,
    getAnalyticsRevenue: vi.fn(),
  }
})

import { getAnalyticsRevenue } from '../../shared/api/client'
import { useAnalyticsRevenue } from './useAnalyticsRevenue'

const mockGetAnalyticsRevenue = vi.mocked(getAnalyticsRevenue)

const defaultParams: AnalyticsRevenueParams = {
  from: '2026-09-01',
  to: '2026-09-07',
  granularity: 'day',
  compare: false,
}

const mockResponse: AnalyticsRevenueResponse = {
  series: [
    {
      bucket: '2026-09-01',
      totalCzk: 1000,
      rides: 5,
      cashCzk: 400,
      cardCzk: 400,
      invoiceCzk: 200,
      appCzk: 500,
      phoneCzk: 300,
      dispatcherCzk: 200,
      meterCzk: 300,
      fixedCzk: 500,
      estimateCzk: 200,
    },
  ],
  aovTrend: [{ bucket: '2026-09-01', aovCzk: 200 }],
  priceOverride: { count: 2, totalDeltaCzk: 150, topReasons: [{ reason: 'Přesčas', count: 2 }] },
  topRoutes: [{ pickupAddress: 'Centrum', dropoffAddress: 'Letiště', rides: 3, revenueCzk: 1500, aovCzk: 500 }],
  zoneRevenue: [{ zoneId: 'z1', zoneName: 'Centrum', rides: 5, revenueCzk: 2000, aovCzk: 400 }],
  smsCost: [{ bucket: '2026-09-01', smsCount: 10, costCzk: 30 }],
  prior: null,
}

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children)
}

describe('useAnalyticsRevenue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls getAnalyticsRevenue with the provided params', async () => {
    mockGetAnalyticsRevenue.mockResolvedValue(mockResponse)
    const { result } = renderHook(() => useAnalyticsRevenue(defaultParams), {
      wrapper: makeWrapper(),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockGetAnalyticsRevenue).toHaveBeenCalledWith(defaultParams)
  })

  it('returns data from the API', async () => {
    mockGetAnalyticsRevenue.mockResolvedValue(mockResponse)
    const { result } = renderHook(() => useAnalyticsRevenue(defaultParams), {
      wrapper: makeWrapper(),
    })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data?.series).toHaveLength(1)
    expect(result.current.data?.aovTrend[0].aovCzk).toBe(200)
  })

  it('uses query key ["analytics", "revenue", params]', async () => {
    mockGetAnalyticsRevenue.mockResolvedValue(mockResponse)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children)

    const { result } = renderHook(() => useAnalyticsRevenue(defaultParams), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const cachedData = qc.getQueryData(['analytics', 'revenue', defaultParams])
    expect(cachedData).toEqual(mockResponse)
  })

  it('exposes isError when the fetch fails', async () => {
    mockGetAnalyticsRevenue.mockRejectedValue(new Error('network failure'))
    const { result } = renderHook(() => useAnalyticsRevenue(defaultParams), {
      wrapper: makeWrapper(),
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

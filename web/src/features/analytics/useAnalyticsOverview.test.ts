import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import * as client from '../../shared/api/client'
import { useAnalyticsOverview } from './useAnalyticsOverview'
import type { AnalyticsOverviewResponse } from '../../shared/api/client'

vi.mock('../../shared/api/client', async (importOriginal) => {
  const original = await importOriginal<typeof client>()
  return {
    ...original,
    getAnalyticsOverview: vi.fn(),
  }
})

const mockGetOverview = vi.mocked(client.getAnalyticsOverview)

const defaultKpi: client.OverviewKpiDto = {
  rides: 10,
  revenueCzk: 5000,
  aov: 500,
  fulfillmentRate: 0.9,
  cancellationRate: 0.1,
  activeCustomers: 8,
  newCustomers: 2,
  activeDrivers: 4,
  onlineDriverHours: 32.5,
  revenuePerOnlineHour: 153.8,
  avgRating: 4.7,
}

const mockResponse: AnalyticsOverviewResponse = {
  current: defaultKpi,
  prior: null,
  deltas: null,
  series: [
    { bucket: '2026-09-01', rides: 5, revenueCzk: 2500 },
    { bucket: '2026-09-02', rides: 5, revenueCzk: 2500 },
  ],
}

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

const defaultParams: client.AnalyticsOverviewParams = {
  from: '2026-09-01',
  to: '2026-09-30',
  granularity: 'day',
  compare: false,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useAnalyticsOverview', () => {
  it('calls getAnalyticsOverview with the given params', async () => {
    mockGetOverview.mockResolvedValue(mockResponse)
    const { result } = renderHook(() => useAnalyticsOverview(defaultParams), {
      wrapper: createWrapper(),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockGetOverview).toHaveBeenCalledWith(defaultParams)
  })

  it('returns the KPI data when successful', async () => {
    mockGetOverview.mockResolvedValue(mockResponse)
    const { result } = renderHook(() => useAnalyticsOverview(defaultParams), {
      wrapper: createWrapper(),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.current.rides).toBe(10)
    expect(result.current.data?.series).toHaveLength(2)
  })

  it('uses the query key [analytics, overview, params]', async () => {
    mockGetOverview.mockResolvedValue(mockResponse)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children)

    const { result } = renderHook(() => useAnalyticsOverview(defaultParams), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // The cache should have a matching key.
    const cached = queryClient.getQueryData(['analytics', 'overview', defaultParams])
    expect(cached).toEqual(mockResponse)
  })

  it('exposes isLoading and isError states', async () => {
    mockGetOverview.mockRejectedValue(new Error('network error'))
    const { result } = renderHook(() => useAnalyticsOverview(defaultParams), {
      wrapper: createWrapper(),
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
  })
})

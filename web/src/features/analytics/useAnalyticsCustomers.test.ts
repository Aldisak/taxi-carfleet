/**
 * Unit tests for useAnalyticsCustomers hook.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import type { AnalyticsCustomersResponse, AnalyticsCustomersParams } from '../../shared/api/client'

vi.mock('../../shared/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../shared/api/client')>('../../shared/api/client')
  return {
    ...actual,
    getAnalyticsCustomers: vi.fn(),
  }
})

import { getAnalyticsCustomers } from '../../shared/api/client'
import { useAnalyticsCustomers } from './useAnalyticsCustomers'

const mockGet = vi.mocked(getAnalyticsCustomers)

const defaultParams: AnalyticsCustomersParams = {
  from: '2026-09-01',
  to: '2026-09-07',
  granularity: 'day',
  compare: false,
}

const mockResponse: AnalyticsCustomersResponse = {
  totalRides: 100,
  totalRevenueCzk: 50000,
  newIdentities: 30,
  returningIdentities: 70,
  repeatRate: 70.0,
  freqOne: 20,
  freqTwoToFive: 15,
  freqSixPlus: 5,
  newVsReturningBuckets: [],
  cohortRows: [],
  topCustomers: [],
  ratings: {
    totalRated: 80,
    avgRating: 4.3,
    distribution: [],
    avgTrend: [],
    worstRated: [],
  },
  prior: null,
}

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children)
}

describe('useAnalyticsCustomers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls getAnalyticsCustomers with the provided params', async () => {
    mockGet.mockResolvedValue(mockResponse)
    const { result } = renderHook(() => useAnalyticsCustomers(defaultParams), {
      wrapper: makeWrapper(),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockGet).toHaveBeenCalledWith(defaultParams)
  })

  it('returns data from the API', async () => {
    mockGet.mockResolvedValue(mockResponse)
    const { result } = renderHook(() => useAnalyticsCustomers(defaultParams), {
      wrapper: makeWrapper(),
    })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data?.totalRides).toBe(100)
    expect(result.current.data?.repeatRate).toBe(70.0)
  })

  it('uses query key ["analytics", "customers", params]', async () => {
    mockGet.mockResolvedValue(mockResponse)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children)

    const { result } = renderHook(() => useAnalyticsCustomers(defaultParams), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const cachedData = qc.getQueryData(['analytics', 'customers', defaultParams])
    expect(cachedData).toEqual(mockResponse)
  })

  it('exposes isError when the fetch fails', async () => {
    mockGet.mockRejectedValue(new Error('network error'))
    const { result } = renderHook(() => useAnalyticsCustomers(defaultParams), {
      wrapper: makeWrapper(),
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

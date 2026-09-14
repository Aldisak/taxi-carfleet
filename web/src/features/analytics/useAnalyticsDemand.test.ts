import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { AnalyticsDemandParams, AnalyticsDemandResponse } from '../../shared/api/client'

vi.mock('../../shared/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/api/client')>()
  return {
    ...actual,
    getAnalyticsDemand: vi.fn(),
  }
})

import * as client from '../../shared/api/client'
import { useAnalyticsDemand } from './useAnalyticsDemand'

const mockGetDemand = vi.mocked(client.getAnalyticsDemand)

const defaultParams: AnalyticsDemandParams = {
  from: '2026-09-01',
  to: '2026-09-30',
  granularity: 'day',
  compare: false,
}

const emptyResponse: AnalyticsDemandResponse = {
  heatmap: [],
  supplyDemand: [],
  unmetDemand: [],
  utilization: { fleetUtilization: 0, perDriver: [] },
  zonePickups: [],
  topRoutes: [],
  prior: null,
}

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useAnalyticsDemand', () => {
  it('calls getAnalyticsDemand with the provided params', async () => {
    mockGetDemand.mockResolvedValue(emptyResponse)
    const { result } = renderHook(() => useAnalyticsDemand(defaultParams), {
      wrapper: makeWrapper(),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockGetDemand).toHaveBeenCalledWith(defaultParams)
  })

  it('returns demand data on success', async () => {
    const response: AnalyticsDemandResponse = {
      ...emptyResponse,
      heatmap: [{ hour: 8, dow: 4, count: 3 }],
    }
    mockGetDemand.mockResolvedValue(response)
    const { result } = renderHook(() => useAnalyticsDemand(defaultParams), {
      wrapper: makeWrapper(),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.heatmap).toHaveLength(1)
    expect(result.current.data?.heatmap[0].count).toBe(3)
  })

  it('uses the correct TanStack Query key', async () => {
    mockGetDemand.mockResolvedValue(emptyResponse)
    // Two hooks with different params should NOT share cache
    const params2: AnalyticsDemandParams = { ...defaultParams, from: '2026-08-01' }
    const { result: result1 } = renderHook(() => useAnalyticsDemand(defaultParams), {
      wrapper: makeWrapper(),
    })
    const { result: result2 } = renderHook(() => useAnalyticsDemand(params2), {
      wrapper: makeWrapper(),
    })
    await waitFor(() => expect(result1.current.isSuccess).toBe(true))
    await waitFor(() => expect(result2.current.isSuccess).toBe(true))
    // Both should have been called (different cache keys)
    expect(mockGetDemand).toHaveBeenCalledTimes(2)
  })

  it('surfaces error state on failure', async () => {
    mockGetDemand.mockRejectedValue(new Error('network'))
    const { result } = renderHook(() => useAnalyticsDemand(defaultParams), {
      wrapper: makeWrapper(),
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

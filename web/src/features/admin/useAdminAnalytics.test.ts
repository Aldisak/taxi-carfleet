import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../../shared/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/api/client')>()
  return { ...actual, getAdminAnalytics: vi.fn() }
})

import * as client from '../../shared/api/client'
import { useAdminAnalytics } from './useAdminAnalytics'

const mockGet = vi.mocked(client.getAdminAnalytics)

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
}

const RESPONSE: client.AdminAnalyticsResponse = {
  fleets: [
    {
      fleetId: '11111111-1111-1111-1111-111111111111',
      fleetName: 'Taxi Demo',
      ridesThisMonth: 120,
      ridesLastMonth: 100,
      revenueThisMonthCzk: 240000,
      revenueLastMonthCzk: 200000,
      momDeltaPct: 20,
      activeDrivers: 8,
      activeCustomers: 60,
      smsCount: 300,
      smsEstimatedCostCzk: 900,
      lastOrderAt: '2026-09-14T08:00:00Z',
      sparklineWeeks: [3, 5, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14],
      health: 'growing',
    },
  ],
  totals: {
    totalFleets: 1,
    totalRidesThisMonth: 120,
    totalRevenueThisMonthCzk: 240000,
    growingFleets: 1,
    decliningFleets: 0,
    inactiveFleets: 0,
  },
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useAdminAnalytics', () => {
  it('calls getAdminAnalytics and exposes the response', async () => {
    mockGet.mockResolvedValue(RESPONSE)
    const { result } = renderHook(() => useAdminAnalytics(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockGet).toHaveBeenCalledTimes(1)
    expect(result.current.data).toEqual(RESPONSE)
  })

  it('surfaces the error state on failure', async () => {
    mockGet.mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useAdminAnalytics(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

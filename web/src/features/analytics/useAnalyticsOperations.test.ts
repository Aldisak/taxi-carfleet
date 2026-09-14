/**
 * Unit tests for useAnalyticsOperations hook.
 * The client is mocked so no real HTTP is made.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { AnalyticsOperationsParams, AnalyticsOperationsResponse } from '../../shared/api/client'

vi.mock('../../shared/api/client', async importOriginal => {
  const actual = await importOriginal<typeof import('../../shared/api/client')>()
  return { ...actual, getAnalyticsOperations: vi.fn() }
})

import * as client from '../../shared/api/client'
import { useAnalyticsOperations } from './useAnalyticsOperations'

const mockGetAnalyticsOperations = vi.mocked(client.getAnalyticsOperations)

const DEFAULT_PARAMS: AnalyticsOperationsParams = {
  from: '2026-09-01',
  to: '2026-09-30',
  granularity: 'day',
  compare: false,
}

const MOCK_RESPONSE: AnalyticsOperationsResponse = {
  sla: {
    timeToAssign: { median: 60, p90: 120, sampleCount: 5 },
    timeToAccept: { median: 30, p90: 90, sampleCount: 4 },
    timeToPickup: null,
    rideDuration: { median: 900, p90: 1800, sampleCount: 3 },
  },
  offerFunnel: {
    offersMade: 50,
    accepted: 40,
    declined: 5,
    timeouts: 5,
    avgOffersPerCompleted: 1.25,
  },
  lifecycle: {
    created: 100,
    assigned: 90,
    accepted: 80,
    arrived: 75,
    inProgress: 70,
    completed: 60,
  },
  cancellations: {
    byRole: [{ role: 'Customer', count: 10 }, { role: 'Driver', count: 3 }],
    byStatusAtCancel: [{ status: 'New', count: 8 }, { status: 'Assigned', count: 5 }],
    byHour: [{ hour: 10, count: 4 }],
    noShowShare: 0.15,
  },
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

describe('useAnalyticsOperations', () => {
  it('calls getAnalyticsOperations with the provided params', async () => {
    mockGetAnalyticsOperations.mockResolvedValue(MOCK_RESPONSE)

    const { result } = renderHook(
      () => useAnalyticsOperations(DEFAULT_PARAMS),
      { wrapper: makeWrapper() }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockGetAnalyticsOperations).toHaveBeenCalledWith(DEFAULT_PARAMS)
  })

  it('returns data on success', async () => {
    mockGetAnalyticsOperations.mockResolvedValue(MOCK_RESPONSE)

    const { result } = renderHook(
      () => useAnalyticsOperations(DEFAULT_PARAMS),
      { wrapper: makeWrapper() }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(MOCK_RESPONSE)
  })

  it('resolves nullable SLA fields gracefully', async () => {
    mockGetAnalyticsOperations.mockResolvedValue(MOCK_RESPONSE)

    const { result } = renderHook(
      () => useAnalyticsOperations(DEFAULT_PARAMS),
      { wrapper: makeWrapper() }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    // timeToPickup is null in the mock — hook should propagate it as-is
    expect(result.current.data?.sla.timeToPickup).toBeNull()
    expect(result.current.data?.sla.timeToAssign?.median).toBe(60)
  })

  it('enters error state when the API rejects', async () => {
    mockGetAnalyticsOperations.mockRejectedValue(new Error('Server error'))

    const { result } = renderHook(
      () => useAnalyticsOperations(DEFAULT_PARAMS),
      { wrapper: makeWrapper() }
    )

    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

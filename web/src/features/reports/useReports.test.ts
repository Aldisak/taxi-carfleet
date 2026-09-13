import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import * as client from '../../shared/api/client'
import { useDriverReport, useFleetReport, useRatings, downloadDriverReportCsv } from './useReports'
import * as csvDownload from './csvDownload'

vi.mock('../../shared/api/client', async (importOriginal) => {
  const original = await importOriginal<typeof client>()
  return {
    ...original,
    getDriverReport: vi.fn(),
    getFleetReport: vi.fn(),
    getRatings: vi.fn(),
    fetchDriverReportCsv: vi.fn(),
  }
})

const mockDriverReport = vi.mocked(client.getDriverReport)
const mockFleetReport = vi.mocked(client.getFleetReport)
const mockRatings = vi.mocked(client.getRatings)
const mockFetchCsv = vi.mocked(client.fetchDriverReportCsv)

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useDriverReport', () => {
  it('loads the report for the given filters', async () => {
    mockDriverReport.mockResolvedValue({
      driverId: 'd1',
      driverName: 'Jan Novák',
      avgRating: null,
      days: [],
      totals: { date: 'Celkem', ridesCompleted: 0, ridesCancelled: 0, cashCzk: 0, cardCzk: 0, invoiceCzk: 0, totalCzk: 0, hoursOnline: 0, priceOverrideCount: 0 },
    })
    const { result } = renderHook(() => useDriverReport({ driverId: 'd1', from: '2026-09-01', to: '2026-09-30' }), {
      wrapper: createWrapper(),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockDriverReport).toHaveBeenCalledWith({ driverId: 'd1', from: '2026-09-01', to: '2026-09-30' })
  })

  it('does NOT fire when disabled (no driver selected)', async () => {
    const { result } = renderHook(
      () => useDriverReport({ driverId: null, from: '2026-09-01', to: '2026-09-30' }, false),
      { wrapper: createWrapper() },
    )
    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'))
    expect(mockDriverReport).not.toHaveBeenCalled()
  })
})

describe('useFleetReport + useRatings', () => {
  it('loads the fleet report', async () => {
    mockFleetReport.mockResolvedValue({
      kpis: { rides: 1, revenueCzk: 1, avgPriceCzk: 1, avgTimeToAssignSeconds: 1, avgTimeToPickupSeconds: null, cancellationRate: 0, appOrders: 1, phoneOrders: 0, fixedRouteOrders: 0, smsCount: 0, smsCostCzk: 0 },
      ridesPerDay: [],
      topRoutes: [],
    })
    const { result } = renderHook(() => useFleetReport({ from: '2026-09-01', to: '2026-09-30' }), {
      wrapper: createWrapper(),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.kpis.rides).toBe(1)
  })

  it('loads ratings (rangeless, no filters)', async () => {
    mockRatings.mockResolvedValue([{ orderPublicCode: 'A', driverName: 'Jan', stars: 5, comment: 'ok', ratedAt: null }])
    const { result } = renderHook(() => useRatings(), {
      wrapper: createWrapper(),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(1)
    expect(mockRatings).toHaveBeenCalledWith()
  })
})

describe('downloadDriverReportCsv', () => {
  it('fetches the server blob and triggers a download with the server filename', async () => {
    const blob = new Blob(['﻿x;y\r\n'], { type: 'text/csv' })
    mockFetchCsv.mockResolvedValue({ blob, filename: 'server.csv' })
    const spy = vi.spyOn(csvDownload, 'downloadBlob').mockImplementation(() => {})

    await downloadDriverReportCsv({ driverId: 'd1', from: '2026-09-01', to: '2026-09-30' })

    expect(mockFetchCsv).toHaveBeenCalledOnce()
    expect(spy).toHaveBeenCalledWith(blob, 'server.csv')
  })
})

/**
 * Component tests for DriverDrilldown — single driver drill-down view.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import { axe } from '../../../shared/test/axe'
import { theme } from '../../../shared/theme/theme'
import i18n from '../../../shared/i18n'
import type { AnalyticsDriverDrilldownResponse, AnalyticsDriversParams } from '../../../shared/api/client'

vi.mock('react-chartjs-2', async () => {
  const { chartMockModule } = await import('../charts/chartMock')
  return chartMockModule()
})

vi.mock('../../../shared/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../shared/api/client')>()
  return {
    ...actual,
    getAnalyticsDriverDrilldown: vi.fn(),
  }
})

vi.mock('./driversCharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./driversCharts')>()
  return {
    ...actual,
    buildWeeklyTrendLineConfig: vi.fn(actual.buildWeeklyTrendLineConfig),
  }
})

import * as client from '../../../shared/api/client'
import * as driversCharts from './driversCharts'
import { DriverDrilldown } from './DriverDrilldown'

const mockGet = vi.mocked(client.getAnalyticsDriverDrilldown)
const mockBuildWeeklyTrend = vi.mocked(driversCharts.buildWeeklyTrendLineConfig)

const defaultParams: AnalyticsDriversParams = {
  from: '2026-09-01',
  to: '2026-09-07',
  granularity: 'day',
  compare: false,
}

const drilldownResponse: AnalyticsDriverDrilldownResponse = {
  driverId: 'driver-aaa',
  name: 'Jan Novák',
  weeklyTrend: [
    { weekStart: '2026-09-01', ridesCompleted: 8, revenueCzk: 4000, avgRating: 4.5 },
    { weekStart: '2026-09-08', ridesCompleted: 12, revenueCzk: 6000, avgRating: null },
  ],
  lowRatedOrders: [
    {
      orderId: 'order-1',
      completedAt: '2026-09-02T10:00:00Z',
      ratingStars: 2,
      ratingComment: 'Řidič byl hrubý',
      publicCode: 'ABC123',
      pickupAddress: 'Centrum',
      dropoffAddress: 'Letiště',
    },
  ],
}

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) =>
    createElement(
      MemoryRouter,
      null,
      createElement(
        QueryClientProvider,
        { client: qc },
        createElement(ThemeProvider, { theme }, createElement(I18nextProvider, { i18n }, children)),
      ),
    )
}

const onBack = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
})

describe('DriverDrilldown', () => {
  it('shows a back button', async () => {
    mockGet.mockResolvedValue(drilldownResponse)
    render(
      createElement(DriverDrilldown, {
        driverId: 'driver-aaa',
        driverName: 'Jan Novák',
        params: defaultParams,
        onBack,
      }),
      { wrapper: makeWrapper() },
    )
    expect(await screen.findByRole('button', { name: /zpět na tabulku/i })).toBeInTheDocument()
  })

  it('calls onBack when back button is clicked', async () => {
    mockGet.mockResolvedValue(drilldownResponse)
    render(
      createElement(DriverDrilldown, {
        driverId: 'driver-aaa',
        driverName: 'Jan Novák',
        params: defaultParams,
        onBack,
      }),
      { wrapper: makeWrapper() },
    )
    const backBtn = await screen.findByRole('button', { name: /zpět na tabulku/i })
    await userEvent.click(backBtn)
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('shows the driver name as a heading', async () => {
    mockGet.mockResolvedValue(drilldownResponse)
    render(
      createElement(DriverDrilldown, {
        driverId: 'driver-aaa',
        driverName: 'Jan Novák',
        params: defaultParams,
        onBack,
      }),
      { wrapper: makeWrapper() },
    )
    expect(await screen.findByRole('heading', { name: 'Jan Novák', level: 1 })).toBeInTheDocument()
  })

  it('shows the weekly trend chart section', async () => {
    mockGet.mockResolvedValue(drilldownResponse)
    render(
      createElement(DriverDrilldown, {
        driverId: 'driver-aaa',
        driverName: 'Jan Novák',
        params: defaultParams,
        onBack,
      }),
      { wrapper: makeWrapper() },
    )
    expect(await screen.findByRole('heading', { name: /týdenní trend/i })).toBeInTheDocument()
  })

  it('shows the low-rated order code in the low-rated table', async () => {
    mockGet.mockResolvedValue(drilldownResponse)
    render(
      createElement(DriverDrilldown, {
        driverId: 'driver-aaa',
        driverName: 'Jan Novák',
        params: defaultParams,
        onBack,
      }),
      { wrapper: makeWrapper() },
    )
    expect(await screen.findByText('ABC123')).toBeInTheDocument()
    expect(screen.getByText('Řidič byl hrubý')).toBeInTheDocument()
  })

  it('builds the weekly-trend chart with i18n-derived legend labels, once per render', async () => {
    mockGet.mockResolvedValue(drilldownResponse)
    render(
      createElement(DriverDrilldown, {
        driverId: 'driver-aaa',
        driverName: 'Jan Novák',
        params: defaultParams,
        onBack,
      }),
      { wrapper: makeWrapper() },
    )
    await screen.findByRole('heading', { name: /týdenní trend/i })
    // W1: builder must be called with translated rides/revenue labels, not the
    // hardcoded Czech defaults. Every invocation must carry all three arguments
    // (data + both labels) — the pre-fix bug called it with data only.
    const callsWithData = mockBuildWeeklyTrend.mock.calls.filter(c => c[0] === drilldownResponse.weeklyTrend)
    expect(callsWithData.length).toBeGreaterThan(0)
    for (const call of callsWithData) {
      expect(call).toHaveLength(3)
      expect(call[1]).toBe(i18n.t('analytics.drivers.drilldown.tableRides'))
      expect(call[2]).toBe(i18n.t('analytics.drivers.drilldown.tableRevenue'))
    }
  })

  it('has no axe violations', async () => {
    mockGet.mockResolvedValue(drilldownResponse)
    const { container } = render(
      createElement(DriverDrilldown, {
        driverId: 'driver-aaa',
        driverName: 'Jan Novák',
        params: defaultParams,
        onBack,
      }),
      { wrapper: makeWrapper() },
    )
    await screen.findByText('ABC123')
    expect(await axe(container)).toHaveNoViolations()
  })
})

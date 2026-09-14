/**
 * Component tests for DriversTab — Řidiči analytics tab.
 * Charts are mocked to avoid canvas dependency in jsdom.
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
import type { AnalyticsDriversResponse, AnalyticsDriversParams } from '../../../shared/api/client'

vi.mock('react-chartjs-2', async () => {
  const { chartMockModule } = await import('../charts/chartMock')
  return chartMockModule()
})

vi.mock('../../../shared/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../shared/api/client')>()
  return {
    ...actual,
    getAnalyticsDrivers: vi.fn(),
    getAnalyticsDriverDrilldown: vi.fn(),
  }
})

import * as client from '../../../shared/api/client'
import { DriversTab } from './DriversTab'

const mockGetDrivers = vi.mocked(client.getAnalyticsDrivers)
const mockGetDrilldown = vi.mocked(client.getAnalyticsDriverDrilldown)

const defaultParams: AnalyticsDriversParams = {
  from: '2026-09-01',
  to: '2026-09-07',
  granularity: 'day',
  compare: false,
}

const responseWithDrivers: AnalyticsDriversResponse = {
  drivers: [
    {
      driverId: 'driver-aaa',
      name: 'Jan Novák',
      ridesCompleted: 20,
      revenueCzk: 10000,
      onlineHours: 8,
      utilizationPct: 75,
      revenuePerOnlineHour: 1250,
      acceptanceRate: 90,
      avgTimeToAcceptSeconds: 30,
      declinesAndTimeouts: 2,
      cancellations: 1,
      noShows: 0,
      avgRating: 4.8,
    },
    {
      driverId: 'driver-bbb',
      name: 'Petr Svoboda',
      ridesCompleted: 10,
      revenueCzk: 5000,
      onlineHours: 4,
      utilizationPct: 60,
      revenuePerOnlineHour: 1250,
      acceptanceRate: 80,
      avgTimeToAcceptSeconds: 45,
      declinesAndTimeouts: 3,
      cancellations: 0,
      noShows: 0,
      avgRating: 4.2,
    },
  ],
  retention: [
    { weekStart: '2026-09-01', active: 2, newlyActivated: 1, churned: 0 },
  ],
  prior: null,
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

beforeEach(() => {
  vi.clearAllMocks()
  mockGetDrilldown.mockReturnValue(new Promise(() => {}))
})

describe('DriversTab', () => {
  it('shows a loading state while fetching', () => {
    mockGetDrivers.mockReturnValue(new Promise(() => {}))
    render(createElement(DriversTab, { params: defaultParams }), { wrapper: makeWrapper() })
    expect(screen.getByText(/načítám řidiče/i)).toBeInTheDocument()
  })

  it('shows an error state when fetching fails', async () => {
    mockGetDrivers.mockRejectedValue(new Error('network error'))
    render(createElement(DriversTab, { params: defaultParams }), { wrapper: makeWrapper() })
    expect(await screen.findByText(/nepodařilo se načíst/i)).toBeInTheDocument()
  })

  it('shows driver names in the league table', async () => {
    mockGetDrivers.mockResolvedValue(responseWithDrivers)
    render(createElement(DriversTab, { params: defaultParams }), { wrapper: makeWrapper() })
    expect(await screen.findByText('Jan Novák')).toBeInTheDocument()
    expect(screen.getByText('Petr Svoboda')).toBeInTheDocument()
  })

  it('shows the retention chart section', async () => {
    mockGetDrivers.mockResolvedValue(responseWithDrivers)
    render(createElement(DriversTab, { params: defaultParams }), { wrapper: makeWrapper() })
    await screen.findByText('Jan Novák')
    expect(screen.getByRole('heading', { name: /retence řidičů/i })).toBeInTheDocument()
  })

  it('sorts the league table by ridesCompleted by default (descending)', async () => {
    mockGetDrivers.mockResolvedValue(responseWithDrivers)
    render(createElement(DriversTab, { params: defaultParams }), { wrapper: makeWrapper() })
    await screen.findByText('Jan Novák')
    const rows = screen.getAllByRole('row')
    // First data row should be Jan Novák (20 rides > 10 rides)
    expect(rows[1]).toHaveTextContent('Jan Novák')
  })

  it('opens drill-down when clicking a driver row', async () => {
    mockGetDrivers.mockResolvedValue(responseWithDrivers)
    mockGetDrilldown.mockReturnValue(new Promise(() => {}))
    render(createElement(DriversTab, { params: defaultParams }), { wrapper: makeWrapper() })
    await screen.findByText('Jan Novák')
    await userEvent.click(screen.getByText('Jan Novák'))
    // Back button appears when drill-down is active
    expect(await screen.findByRole('button', { name: /zpět na tabulku/i })).toBeInTheDocument()
  })

  it('has a CSV export button for the league table', async () => {
    mockGetDrivers.mockResolvedValue(responseWithDrivers)
    render(createElement(DriversTab, { params: defaultParams }), { wrapper: makeWrapper() })
    await screen.findByText('Jan Novák')
    expect(screen.getByRole('button', { name: /exportovat csv/i })).toBeInTheDocument()
  })

  it('sort column headers are focusable buttons (keyboard accessible)', async () => {
    mockGetDrivers.mockResolvedValue(responseWithDrivers)
    render(createElement(DriversTab, { params: defaultParams }), { wrapper: makeWrapper() })
    await screen.findByText('Jan Novák')
    // Column headers must contain buttons so keyboard users can activate sort
    const ridesHeader = screen.getByRole('button', { name: /jízdy/i })
    expect(ridesHeader).toBeInTheDocument()
    const revenueHeader = screen.getByRole('button', { name: /tržby/i })
    expect(revenueHeader).toBeInTheDocument()
  })

  it('driver name activates drill-down via button (keyboard accessible)', async () => {
    mockGetDrivers.mockResolvedValue(responseWithDrivers)
    mockGetDrilldown.mockReturnValue(new Promise(() => {}))
    render(createElement(DriversTab, { params: defaultParams }), { wrapper: makeWrapper() })
    await screen.findByText('Jan Novák')
    // Driver name must be a button so keyboard users can open drill-down
    const driverButton = screen.getByRole('button', { name: 'Jan Novák' })
    expect(driverButton).toBeInTheDocument()
    await userEvent.keyboard('{Tab}')
    await userEvent.click(driverButton)
    expect(await screen.findByRole('button', { name: /zpět na tabulku/i })).toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    mockGetDrivers.mockResolvedValue(responseWithDrivers)
    const { container } = render(createElement(DriversTab, { params: defaultParams }), {
      wrapper: makeWrapper(),
    })
    await screen.findByText('Jan Novák')
    expect(await axe(container)).toHaveNoViolations()
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import { axe } from '../../../shared/test/axe'
import { theme } from '../../../shared/theme/theme'
import i18n from '../../../shared/i18n'
import type { AnalyticsDemandParams, AnalyticsDemandResponse, DemandTopRouteDto } from '../../../shared/api/client'

// Mock react-chartjs-2 so Bar renders a stub div (no canvas in jsdom)
vi.mock('react-chartjs-2', async () => {
  const { chartMockModule } = await import('../charts/chartMock')
  return chartMockModule()
})

vi.mock('../../../shared/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../shared/api/client')>()
  return {
    ...actual,
    getAnalyticsDemand: vi.fn(),
  }
})

import * as client from '../../../shared/api/client'
import { DemandTab } from './DemandTab'

const mockGetDemand = vi.mocked(client.getAnalyticsDemand)

const defaultParams: AnalyticsDemandParams = {
  from: '2026-09-01',
  to: '2026-09-30',
  granularity: 'day',
  compare: false,
}

const happyResponse: AnalyticsDemandResponse = {
  heatmap: [
    { hour: 8, dow: 1, count: 5 },
    { hour: 9, dow: 4, count: 3 },
  ],
  supplyDemand: [
    { hour: 8, ordersCreated: 10, onlineSeconds: 3600, fulfillmentRate: 0.8 },
  ],
  unmetDemand: [
    { hour: 10, unmetCount: 2 },
  ],
  utilization: {
    fleetUtilization: 0.65,
    perDriver: [
      { driverId: 'driver-1', busySeconds: 1800, onlineSeconds: 3600, utilization: 0.5 },
    ],
  },
  zonePickups: [
    { zoneId: 'z1', zoneName: 'Centrum', pickupCount: 42 },
  ],
  topRoutes: [
    { pickupAddress: 'Náměstí Míru', dropoffAddress: 'Letiště', count: 15 } satisfies DemandTopRouteDto,
  ],
  prior: null,
}

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) =>
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(ThemeProvider, { theme }, createElement(I18nextProvider, { i18n }, children)),
    )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('DemandTab', () => {
  it('shows a loading state while fetching', () => {
    mockGetDemand.mockReturnValue(new Promise(() => {}))
    render(createElement(DemandTab, { params: defaultParams }), { wrapper: makeWrapper() })
    expect(screen.getByText(/načítám poptávku/i)).toBeInTheDocument()
  })

  it('shows an error state on failure', async () => {
    mockGetDemand.mockRejectedValue(new Error('network'))
    render(createElement(DemandTab, { params: defaultParams }), { wrapper: makeWrapper() })
    expect(await screen.findByText(/nepodařilo se načíst/i)).toBeInTheDocument()
  })

  it('renders heatmap chart when data loads', async () => {
    mockGetDemand.mockResolvedValue(happyResponse)
    render(createElement(DemandTab, { params: defaultParams }), { wrapper: makeWrapper() })
    // Wait for data to load
    await screen.findAllByText(/vytíženost flotily/i)
    // Chart mocks render data-testid="chart-mock"
    const charts = screen.getAllByTestId('chart-mock')
    expect(charts.length).toBeGreaterThanOrEqual(3) // heatmap + supply/demand + unmet
  })

  it('renders fleet utilization percentage', async () => {
    mockGetDemand.mockResolvedValue(happyResponse)
    render(createElement(DemandTab, { params: defaultParams }), { wrapper: makeWrapper() })
    await screen.findAllByText(/vytíženost flotily/i)
    // 65% utilization
    expect(screen.getByText('65 %')).toBeInTheDocument()
  })

  it('renders zone pickups table', async () => {
    mockGetDemand.mockResolvedValue(happyResponse)
    render(createElement(DemandTab, { params: defaultParams }), { wrapper: makeWrapper() })
    await screen.findAllByText(/vytíženost flotily/i)
    expect(screen.getByText('Centrum')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('renders top routes table', async () => {
    mockGetDemand.mockResolvedValue(happyResponse)
    render(createElement(DemandTab, { params: defaultParams }), { wrapper: makeWrapper() })
    await screen.findAllByText(/vytíženost flotily/i)
    expect(screen.getByText('Náměstí Míru')).toBeInTheDocument()
    expect(screen.getByText('Letiště')).toBeInTheDocument()
  })

  it('has a CSV export button for heatmap', async () => {
    mockGetDemand.mockResolvedValue(happyResponse)
    render(createElement(DemandTab, { params: defaultParams }), { wrapper: makeWrapper() })
    await screen.findAllByText(/vytíženost flotily/i)
    const csvButtons = screen.getAllByRole('button', { name: /csv/i })
    expect(csvButtons.length).toBeGreaterThanOrEqual(1)
  })

  it('renders accessible data tables for each chart section', async () => {
    mockGetDemand.mockResolvedValue(happyResponse)
    render(createElement(DemandTab, { params: defaultParams }), { wrapper: makeWrapper() })
    await screen.findAllByText(/vytíženost flotily/i)
    const tables = screen.getAllByRole('table')
    // At minimum: heatmap sr-only table + zone pickups table + top routes table
    expect(tables.length).toBeGreaterThanOrEqual(3)
  })

  it('has no axe violations when data is loaded', async () => {
    mockGetDemand.mockResolvedValue(happyResponse)
    const { container } = render(createElement(DemandTab, { params: defaultParams }), {
      wrapper: makeWrapper(),
    })
    await screen.findAllByText(/vytíženost flotily/i)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('shows empty state when all sections are empty', async () => {
    const emptyResponse: AnalyticsDemandResponse = {
      heatmap: [],
      supplyDemand: [],
      unmetDemand: [],
      utilization: { fleetUtilization: 0, perDriver: [] },
      zonePickups: [],
      topRoutes: [],
      prior: null,
    }
    mockGetDemand.mockResolvedValue(emptyResponse)
    render(createElement(DemandTab, { params: defaultParams }), { wrapper: makeWrapper() })
    await screen.findByText(/žádná data/i)
  })

  it('triggers CSV download when heatmap CSV button is clicked', async () => {
    const user = userEvent.setup()
    // Mock URL.createObjectURL and link.click
    const createObjectURL = vi.fn(() => 'blob:mock')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(globalThis, 'URL', {
      value: { createObjectURL, revokeObjectURL },
      writable: true,
    })

    mockGetDemand.mockResolvedValue(happyResponse)
    render(createElement(DemandTab, { params: defaultParams }), { wrapper: makeWrapper() })
    await screen.findAllByText(/vytíženost flotily/i)

    const csvButtons = screen.getAllByRole('button', { name: /csv/i })
    await user.click(csvButtons[0])
    expect(createObjectURL).toHaveBeenCalled()
  })
})

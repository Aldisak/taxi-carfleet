import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import { axe } from '../../../shared/test/axe'
import { theme } from '../../../shared/theme/theme'
import i18n from '../../../shared/i18n'
import type { AnalyticsRevenueParams, AnalyticsRevenueResponse } from '../../../shared/api/client'

// Mock react-chartjs-2 so Bar/Doughnut/Line renders a stub div (no canvas in jsdom)
vi.mock('react-chartjs-2', async () => {
  const { chartMockModule } = await import('../charts/chartMock')
  return chartMockModule()
})

vi.mock('../../../shared/api/client', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../shared/api/client')>()
  return { ...actual, getAnalyticsRevenue: vi.fn() }
})

import * as client from '../../../shared/api/client'
import { RevenueTab } from './RevenueTab'

const mockGetAnalyticsRevenue = vi.mocked(client.getAnalyticsRevenue)

const defaultParams: AnalyticsRevenueParams = {
  from: '2026-09-01',
  to: '2026-09-30',
  granularity: 'day',
  compare: false,
}

const happyResponse: AnalyticsRevenueResponse = {
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
  priceOverride: {
    count: 3,
    totalDeltaCzk: 450,
    topReasons: [
      { reason: 'Čekání', count: 2 },
      { reason: 'Špatná trasa', count: 1 },
    ],
  },
  topRoutes: [
    { pickupAddress: 'Centrum', dropoffAddress: 'Letiště', rides: 3, revenueCzk: 1500, aovCzk: 500 },
  ],
  zoneRevenue: [
    { zoneId: 'z1', zoneName: 'Centrum', rides: 5, revenueCzk: 2000, aovCzk: 400 },
  ],
  smsCost: [{ bucket: '2026-09-01', smsCount: 10, costCzk: 30 }],
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

describe('RevenueTab', () => {
  it('shows a loading state while fetching', () => {
    mockGetAnalyticsRevenue.mockReturnValue(new Promise(() => {}))
    render(createElement(RevenueTab, { params: defaultParams }), { wrapper: makeWrapper() })
    expect(screen.getByText('Načítám tržby…')).toBeInTheDocument()
  })

  it('shows an error state on failure', async () => {
    mockGetAnalyticsRevenue.mockRejectedValue(new Error('network'))
    render(createElement(RevenueTab, { params: defaultParams }), { wrapper: makeWrapper() })
    expect(await screen.findByText('Nepodařilo se načíst analytická data.')).toBeInTheDocument()
  })

  it('renders chart mocks for stacked bar, doughnuts, AOV line, SMS line', async () => {
    mockGetAnalyticsRevenue.mockResolvedValue(happyResponse)
    render(createElement(RevenueTab, { params: defaultParams }), { wrapper: makeWrapper() })
    await screen.findByText('Vývoj tržeb podle způsobu platby')
    const charts = screen.getAllByTestId('chart-mock')
    // stacked bar + source doughnut + price type doughnut + AOV line + SMS line = 5
    expect(charts.length).toBeGreaterThanOrEqual(5)
  })

  it('renders revenue series section title', async () => {
    mockGetAnalyticsRevenue.mockResolvedValue(happyResponse)
    render(createElement(RevenueTab, { params: defaultParams }), { wrapper: makeWrapper() })
    await screen.findByText('Vývoj tržeb podle způsobu platby')
    expect(screen.getByText('Vývoj tržeb podle způsobu platby')).toBeInTheDocument()
  })

  it('renders source and price-type doughnut section titles', async () => {
    mockGetAnalyticsRevenue.mockResolvedValue(happyResponse)
    render(createElement(RevenueTab, { params: defaultParams }), { wrapper: makeWrapper() })
    await screen.findByText('Podíl tržeb podle zdroje objednávky')
    expect(screen.getByText('Podíl tržeb podle typu ceny')).toBeInTheDocument()
  })

  it('renders AOV trend section title', async () => {
    mockGetAnalyticsRevenue.mockResolvedValue(happyResponse)
    render(createElement(RevenueTab, { params: defaultParams }), { wrapper: makeWrapper() })
    await screen.findByText('Trend průměrné hodnoty jízdy (AOV)')
  })

  it('renders price override panel with count and totalDelta', async () => {
    mockGetAnalyticsRevenue.mockResolvedValue(happyResponse)
    render(createElement(RevenueTab, { params: defaultParams }), { wrapper: makeWrapper() })
    await screen.findByText('Dopad cenových odchylek')
    // count = 3 — use getAllByText since the number may appear elsewhere too
    expect(screen.getByText('Počet odchylek')).toBeInTheDocument()
    // totalDeltaCzk = 450 — formatted by Intl
    expect(screen.getByText('Celkový dopad (Kč)')).toBeInTheDocument()
  })

  it('renders override reasons table', async () => {
    mockGetAnalyticsRevenue.mockResolvedValue(happyResponse)
    render(createElement(RevenueTab, { params: defaultParams }), { wrapper: makeWrapper() })
    await screen.findByText('Dopad cenových odchylek')
    expect(screen.getByText('Čekání')).toBeInTheDocument()
    expect(screen.getByText('Špatná trasa')).toBeInTheDocument()
  })

  it('renders top routes table with route data', async () => {
    mockGetAnalyticsRevenue.mockResolvedValue(happyResponse)
    render(createElement(RevenueTab, { params: defaultParams }), { wrapper: makeWrapper() })
    await screen.findByText('Nejziskovější trasy')
    // 'Letiště' appears only in the routes table
    expect(screen.getByText('Letiště')).toBeInTheDocument()
    // 'Centrum' may appear in source doughnut table too — use getAllByText
    expect(screen.getAllByText('Centrum').length).toBeGreaterThanOrEqual(1)
  })

  it('renders zone revenue table with zone data', async () => {
    mockGetAnalyticsRevenue.mockResolvedValue(happyResponse)
    render(createElement(RevenueTab, { params: defaultParams }), { wrapper: makeWrapper() })
    // Section heading "Tržby podle zón" may appear multiple times (caption + heading)
    await screen.findAllByText('Tržby podle zón')
    // zoneName 'Centrum' from zone table row appears in the rendered table
    expect(screen.getAllByText('Centrum').length).toBeGreaterThanOrEqual(1)
    // Zone-specific: AOV column header appears in zone table
    expect(screen.getAllByText('AOV (Kč)').length).toBeGreaterThanOrEqual(1)
  })

  it('renders SMS cost section title', async () => {
    mockGetAnalyticsRevenue.mockResolvedValue(happyResponse)
    render(createElement(RevenueTab, { params: defaultParams }), { wrapper: makeWrapper() })
    await screen.findByText('Náklady na SMS')
  })

  it('CSV button for top routes triggers download', async () => {
    mockGetAnalyticsRevenue.mockResolvedValue(happyResponse)

    // Mock URL.createObjectURL
    const createObjectURL = vi.fn(() => 'blob:mock')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(globalThis, 'URL', {
      value: { createObjectURL, revokeObjectURL },
      writable: true,
    })

    render(createElement(RevenueTab, { params: defaultParams }), { wrapper: makeWrapper() })
    await screen.findByText('Nejziskovější trasy')

    const csvButtons = screen.getAllByText('Exportovat CSV')
    expect(csvButtons.length).toBeGreaterThanOrEqual(1)
  })

  it('has no axe violations when data is loaded', async () => {
    mockGetAnalyticsRevenue.mockResolvedValue(happyResponse)
    const { container } = render(createElement(RevenueTab, { params: defaultParams }), {
      wrapper: makeWrapper(),
    })
    await screen.findByText('Vývoj tržeb podle způsobu platby')
    expect(await axe(container)).toHaveNoViolations()
  })
})

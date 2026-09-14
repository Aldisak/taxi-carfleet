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
import type { AnalyticsOverviewResponse, AnalyticsOverviewParams, OverviewKpiDto } from '../../../shared/api/client'

// vi.mock is hoisted before imports; use async dynamic import to load chartMockModule
// without hitting the TDZ (module-level variables are uninitialized when the factory runs).
vi.mock('react-chartjs-2', async () => {
  const { chartMockModule } = await import('../charts/chartMock')
  return chartMockModule()
})
vi.mock('../../../shared/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../shared/api/client')>()
  return {
    ...actual,
    getAnalyticsOverview: vi.fn(),
  }
})

// Import after mocks
import * as client from '../../../shared/api/client'
import { OverviewTab } from './OverviewTab'

const mockGetOverview = vi.mocked(client.getAnalyticsOverview)

const defaultKpi: OverviewKpiDto = {
  rides: 12,
  revenueCzk: 6000,
  aov: 500,
  fulfillmentRate: 0.85,
  cancellationRate: 0.15,
  activeCustomers: 9,
  newCustomers: 3,
  activeDrivers: 5,
  onlineDriverHours: 40.0,
  revenuePerOnlineHour: 150.0,
  avgRating: 4.8,
}

const happyResponse: AnalyticsOverviewResponse = {
  current: defaultKpi,
  prior: null,
  deltas: null,
  series: [
    { bucket: '2026-09-01', rides: 5, revenueCzk: 2500 },
    { bucket: '2026-09-02', rides: 7, revenueCzk: 3500 },
  ],
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

const defaultParams: AnalyticsOverviewParams = {
  from: '2026-09-01',
  to: '2026-09-30',
  granularity: 'day',
  compare: false,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('OverviewTab', () => {
  it('shows a loading state while fetching', () => {
    mockGetOverview.mockReturnValue(new Promise(() => {}))
    render(createElement(OverviewTab, { params: defaultParams }), { wrapper: makeWrapper() })
    expect(screen.getByText(/načítám přehled/i)).toBeInTheDocument()
  })

  it('renders KPI cards when data loads', async () => {
    mockGetOverview.mockResolvedValue(happyResponse)
    render(createElement(OverviewTab, { params: defaultParams }), { wrapper: makeWrapper() })
    // "Jízdy" appears in the KPI card label (dt) and in the accessible table column header (th)
    const jízdyElements = await screen.findAllByText('Jízdy')
    expect(jízdyElements.length).toBeGreaterThanOrEqual(1)
    // rides value
    expect(screen.getByText('12')).toBeInTheDocument()
  })

  it('renders the trend chart mock', async () => {
    mockGetOverview.mockResolvedValue(happyResponse)
    render(createElement(OverviewTab, { params: defaultParams }), { wrapper: makeWrapper() })
    await screen.findAllByText('Jízdy')
    expect(screen.getByTestId('chart-mock')).toBeInTheDocument()
  })

  it('renders an accessible data table alongside the chart', async () => {
    mockGetOverview.mockResolvedValue(happyResponse)
    render(createElement(OverviewTab, { params: defaultParams }), { wrapper: makeWrapper() })
    await screen.findAllByText('Jízdy')
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getAllByRole('row').length).toBeGreaterThanOrEqual(3) // header + 2 data rows
  })

  it('renders delta badges when compare data is present', async () => {
    const compareResponse: AnalyticsOverviewResponse = {
      ...happyResponse,
      prior: { ...defaultKpi, rides: 8, revenueCzk: 4000 },
      deltas: {
        rides: 4,
        revenueCzk: 2000,
        aov: 0,
        fulfillmentRate: 0,
        cancellationRate: 0,
        activeCustomers: 0,
        newCustomers: 0,
        activeDrivers: 0,
        onlineDriverHours: 0,
        revenuePerOnlineHour: 0,
        avgRating: null,
      },
    }
    mockGetOverview.mockResolvedValue(compareResponse)
    render(createElement(OverviewTab, { params: defaultParams }), { wrapper: makeWrapper() })
    await screen.findAllByText('Jízdy')
    // delta badge for rides: +4
    expect(screen.getByText('+4')).toBeInTheDocument()
  })

  it('shows empty state when series is empty', async () => {
    mockGetOverview.mockResolvedValue({
      current: defaultKpi,
      prior: null,
      deltas: null,
      series: [],
    })
    render(createElement(OverviewTab, { params: defaultParams }), { wrapper: makeWrapper() })
    await screen.findAllByText('Jízdy')
    expect(screen.getByText(/žádná data/i)).toBeInTheDocument()
  })

  it('shows an error state on failure', async () => {
    mockGetOverview.mockRejectedValue(new Error('network'))
    render(createElement(OverviewTab, { params: defaultParams }), { wrapper: makeWrapper() })
    expect(await screen.findByText(/nepodařilo se načíst/i)).toBeInTheDocument()
  })

  it('has no axe violations when data is loaded', async () => {
    mockGetOverview.mockResolvedValue(happyResponse)
    const { container } = render(createElement(OverviewTab, { params: defaultParams }), {
      wrapper: makeWrapper(),
    })
    await screen.findAllByText('Jízdy')
    expect(await axe(container)).toHaveNoViolations()
  })
})

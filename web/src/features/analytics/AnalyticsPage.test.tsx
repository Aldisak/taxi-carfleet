import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import { axe } from '../../shared/test/axe'
import { theme } from '../../shared/theme/theme'
import i18n from '../../shared/i18n'
import type { AnalyticsOverviewResponse, OverviewKpiDto } from '../../shared/api/client'

// vi.mock is hoisted before imports; use async dynamic import to load chartMockModule
// without hitting the TDZ (module-level variables are uninitialized when the factory runs).
vi.mock('react-chartjs-2', async () => {
  const { chartMockModule } = await import('./charts/chartMock')
  return chartMockModule()
})

vi.mock('../../shared/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/api/client')>()
  return {
    ...actual,
    getAnalyticsOverview: vi.fn(),
    getAnalyticsDemand: vi.fn(),
    getAnalyticsOperations: vi.fn(),
    getAnalyticsRevenue: vi.fn(),
    getAnalyticsDrivers: vi.fn(),
    getAnalyticsDriverDrilldown: vi.fn(),
    getAnalyticsCustomers: vi.fn(),
  }
})

import * as client from '../../shared/api/client'
import { AnalyticsPage } from './AnalyticsPage'

const mockGetOverview = vi.mocked(client.getAnalyticsOverview)
const mockGetDemand = vi.mocked(client.getAnalyticsDemand)
const mockGetOperations = vi.mocked(client.getAnalyticsOperations)
const mockGetRevenue = vi.mocked(client.getAnalyticsRevenue)
const mockGetDrivers = vi.mocked(client.getAnalyticsDrivers)
const mockGetCustomers = vi.mocked(client.getAnalyticsCustomers)

const defaultKpi: OverviewKpiDto = {
  rides: 10,
  revenueCzk: 5000,
  aov: 500,
  fulfillmentRate: 0.9,
  cancellationRate: 0.1,
  activeCustomers: 8,
  newCustomers: 2,
  activeDrivers: 4,
  onlineDriverHours: 32.5,
  revenuePerOnlineHour: 153.8,
  avgRating: 4.7,
}

const happyResponse: AnalyticsOverviewResponse = {
  current: defaultKpi,
  prior: null,
  deltas: null,
  series: [{ bucket: '2026-09-01', rides: 10, revenueCzk: 5000 }],
}

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) =>
    createElement(
      MemoryRouter,
      null,
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(ThemeProvider, { theme }, createElement(I18nextProvider, { i18n }, children)),
      ),
    )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetOverview.mockResolvedValue(happyResponse)
  mockGetDemand.mockReturnValue(new Promise(() => {})) // Demand tab: stays loading by default
  mockGetOperations.mockReturnValue(new Promise(() => {})) // Operations tab: stays loading by default
  mockGetRevenue.mockReturnValue(new Promise(() => {})) // Revenue tab: stays loading by default
  mockGetDrivers.mockReturnValue(new Promise(() => {})) // Drivers tab: stays loading by default
  mockGetCustomers.mockReturnValue(new Promise(() => {})) // Customers tab: stays loading by default
  // AuthStorage needs a role for FleetAdmin gating if needed; AnalyticsPage itself doesn't gate (its route does)
  localStorage.setItem('auth.userRole', 'FleetAdmin')
})

describe('AnalyticsPage', () => {
  it('renders the tab navigation with all six tabs', () => {
    render(createElement(AnalyticsPage), { wrapper: makeWrapper() })
    expect(screen.getByRole('tab', { name: /přehled/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /poptávka/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /provoz/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /tržby/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /řidiči/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /zákazníci/i })).toBeInTheDocument()
  })

  it('renders AnalyticsControls in the Přehled tab', () => {
    render(createElement(AnalyticsPage), { wrapper: makeWrapper() })
    // The period label is rendered by AnalyticsControls
    expect(screen.getByText('Období')).toBeInTheDocument()
  })

  it('shows the Overview content by default', async () => {
    render(createElement(AnalyticsPage), { wrapper: makeWrapper() })
    await screen.findAllByText('Jízdy')
  })

  it('shows the Demand tab when clicking Poptávka', async () => {
    render(createElement(AnalyticsPage), { wrapper: makeWrapper() })
    await userEvent.click(screen.getByRole('tab', { name: /poptávka/i }))
    // DemandTab renders a loading message while fetching
    expect(await screen.findByText(/načítám poptávku/i)).toBeInTheDocument()
  })

  it('shows the Operations tab when clicking Provoz', async () => {
    render(createElement(AnalyticsPage), { wrapper: makeWrapper() })
    await userEvent.click(screen.getByRole('tab', { name: /provoz/i }))
    // OperationsTab renders a loading message while fetching
    expect(await screen.findByText('Načítám provoz…')).toBeInTheDocument()
  })

  it('shows the Revenue tab when clicking Tržby', async () => {
    render(createElement(AnalyticsPage), { wrapper: makeWrapper() })
    await userEvent.click(screen.getByRole('tab', { name: /tržby/i }))
    // RevenueTab renders a loading message while fetching
    expect(await screen.findByText('Načítám tržby…')).toBeInTheDocument()
  })

  it('shows the Drivers tab when clicking Řidiči', async () => {
    render(createElement(AnalyticsPage), { wrapper: makeWrapper() })
    await userEvent.click(screen.getByRole('tab', { name: /řidiči/i }))
    // DriversTab renders a loading message while fetching
    expect(await screen.findByText(/načítám řidiče/i)).toBeInTheDocument()
  })

  it('shows the Customers tab when clicking Zákazníci', async () => {
    render(createElement(AnalyticsPage), { wrapper: makeWrapper() })
    await userEvent.click(screen.getByRole('tab', { name: /zákazníci/i }))
    // CustomersTab renders a loading message while fetching
    expect(await screen.findByText(/načítám zákazníky/i)).toBeInTheDocument()
  })

  it('has no axe violations on initial render', async () => {
    const { container } = render(createElement(AnalyticsPage), { wrapper: makeWrapper() })
    await screen.findAllByText('Jízdy')
    expect(await axe(container)).toHaveNoViolations()
  })
})

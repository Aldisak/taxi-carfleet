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
import type { AnalyticsOperationsParams, AnalyticsOperationsResponse } from '../../../shared/api/client'

// Mock react-chartjs-2 so Bar/Doughnut renders a stub div (no canvas in jsdom)
vi.mock('react-chartjs-2', async () => {
  const { chartMockModule } = await import('../charts/chartMock')
  return chartMockModule()
})

vi.mock('../../../shared/api/client', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../shared/api/client')>()
  return { ...actual, getAnalyticsOperations: vi.fn() }
})

import * as client from '../../../shared/api/client'
import { OperationsTab } from './OperationsTab'

const mockGetAnalyticsOperations = vi.mocked(client.getAnalyticsOperations)

const defaultParams: AnalyticsOperationsParams = {
  from: '2026-09-01',
  to: '2026-09-30',
  granularity: 'day',
  compare: false,
}

const happyResponse: AnalyticsOperationsResponse = {
  sla: {
    timeToAssign: { median: 120, p90: 240, sampleCount: 10 },
    timeToAccept: { median: 60, p90: 180, sampleCount: 8 },
    timeToPickup: { median: 300, p90: 600, sampleCount: 7 },
    rideDuration: { median: 1200, p90: 2400, sampleCount: 6 },
  },
  offerFunnel: {
    offersMade: 100,
    accepted: 80,
    declined: 12,
    timeouts: 8,
    avgOffersPerCompleted: 1.25,
  },
  lifecycle: {
    created: 200,
    assigned: 180,
    accepted: 160,
    arrived: 150,
    inProgress: 140,
    completed: 120,
  },
  cancellations: {
    byRole: [
      { role: 'Customer', count: 15 },
      { role: 'Driver', count: 5 },
    ],
    byStatusAtCancel: [
      { status: 'New', count: 8 },
      { status: 'Assigned', count: 12 },
    ],
    byHour: [
      { hour: 8, count: 3 },
      { hour: 12, count: 7 },
    ],
    noShowShare: 0.217,
  },
  prior: null,
}

const partialSlaResponse: AnalyticsOperationsResponse = {
  ...happyResponse,
  sla: {
    timeToAssign: null,
    timeToAccept: { median: 45, p90: 95, sampleCount: 3 },
    timeToPickup: null,
    rideDuration: { median: 900, p90: 1800, sampleCount: 4 },
  },
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

describe('OperationsTab', () => {
  it('shows a loading state while fetching', () => {
    mockGetAnalyticsOperations.mockReturnValue(new Promise(() => {}))
    render(createElement(OperationsTab, { params: defaultParams }), { wrapper: makeWrapper() })
    // i18n resolves Czech: "Načítám provoz…"
    expect(screen.getByText('Načítám provoz…')).toBeInTheDocument()
  })

  it('shows an error state on failure', async () => {
    mockGetAnalyticsOperations.mockRejectedValue(new Error('network'))
    render(createElement(OperationsTab, { params: defaultParams }), { wrapper: makeWrapper() })
    expect(await screen.findByText('Nepodařilo se načíst analytická data.')).toBeInTheDocument()
  })

  it('renders chart mocks for SLA, offer funnel, lifecycle, and cancellation', async () => {
    mockGetAnalyticsOperations.mockResolvedValue(happyResponse)
    render(createElement(OperationsTab, { params: defaultParams }), { wrapper: makeWrapper() })
    // Wait for data: the offer funnel table has "Nabídky odeslány" label
    await screen.findByText('Nabídky odeslány')
    const charts = screen.getAllByTestId('chart-mock')
    expect(charts.length).toBeGreaterThanOrEqual(4) // SLA bar + offer bar + lifecycle bar + cancellation doughnut
  })

  it('renders SLA section title', async () => {
    mockGetAnalyticsOperations.mockResolvedValue(happyResponse)
    render(createElement(OperationsTab, { params: defaultParams }), { wrapper: makeWrapper() })
    await screen.findByText('Nabídky odeslány')
    expect(screen.getByText('SLA metriky')).toBeInTheDocument()
  })

  it('shows em-dash for null SLA metrics in the visible table', async () => {
    mockGetAnalyticsOperations.mockResolvedValue(partialSlaResponse)
    render(createElement(OperationsTab, { params: defaultParams }), { wrapper: makeWrapper() })
    await screen.findByText('Nabídky odeslány')
    // null timeToAssign and timeToPickup should show "—"
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThanOrEqual(2)
  })

  it('renders offer funnel section with avgOffersPerCompleted', async () => {
    mockGetAnalyticsOperations.mockResolvedValue(happyResponse)
    render(createElement(OperationsTab, { params: defaultParams }), { wrapper: makeWrapper() })
    await screen.findByText('Nabídky odeslány')
    // avgOffersPerCompleted = 1.25 should appear somewhere
    expect(screen.getByText(/1.25/)).toBeInTheDocument()
  })

  it('renders cancellation breakdown table with by-role rows', async () => {
    mockGetAnalyticsOperations.mockResolvedValue(happyResponse)
    render(createElement(OperationsTab, { params: defaultParams }), { wrapper: makeWrapper() })
    await screen.findByText('Nabídky odeslány')
    // byRole: Customer(15), Driver(5)
    expect(screen.getByText('Customer')).toBeInTheDocument()
    expect(screen.getByText('15')).toBeInTheDocument()
    expect(screen.getByText('Driver')).toBeInTheDocument()
  })

  it('renders accessible tables for every chart section (sr-only fallbacks)', async () => {
    mockGetAnalyticsOperations.mockResolvedValue(happyResponse)
    render(createElement(OperationsTab, { params: defaultParams }), { wrapper: makeWrapper() })
    await screen.findByText('Nabídky odeslány')
    const tables = screen.getAllByRole('table')
    // At least: SLA sr-only+visible, offer funnel sr-only, lifecycle sr-only, cancellation visible
    expect(tables.length).toBeGreaterThanOrEqual(4)
  })

  it('renders cancellation by-hour table rows', async () => {
    mockGetAnalyticsOperations.mockResolvedValue(happyResponse)
    render(createElement(OperationsTab, { params: defaultParams }), { wrapper: makeWrapper() })
    await screen.findByText('Nabídky odeslány')
    // byHour: [{ hour: 8, count: 3 }, { hour: 12, count: 7 }]
    expect(screen.getByText('8:00')).toBeInTheDocument()
    expect(screen.getByText('12:00')).toBeInTheDocument()
  })

  it('has no axe violations when data is loaded', async () => {
    mockGetAnalyticsOperations.mockResolvedValue(happyResponse)
    const { container } = render(createElement(OperationsTab, { params: defaultParams }), {
      wrapper: makeWrapper(),
    })
    await screen.findByText('Nabídky odeslány')
    expect(await axe(container)).toHaveNoViolations()
  })
})

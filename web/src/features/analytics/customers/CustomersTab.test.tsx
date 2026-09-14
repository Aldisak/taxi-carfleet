/**
 * Component tests for CustomersTab — Zákazníci analytics tab.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import { axe } from '../../../shared/test/axe'
import { theme } from '../../../shared/theme/theme'
import i18n from '../../../shared/i18n'
import type { AnalyticsCustomersResponse, AnalyticsCustomersParams } from '../../../shared/api/client'

vi.mock('react-chartjs-2', async () => {
  const { chartMockModule } = await import('../charts/chartMock')
  return chartMockModule()
})

vi.mock('../../../shared/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../shared/api/client')>()
  return {
    ...actual,
    getAnalyticsCustomers: vi.fn(),
  }
})

vi.mock('./customersCharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./customersCharts')>()
  return {
    ...actual,
    buildRatingsDistributionBarConfig: vi.fn(actual.buildRatingsDistributionBarConfig),
    buildRatingsTrendLineConfig: vi.fn(actual.buildRatingsTrendLineConfig),
  }
})

import * as client from '../../../shared/api/client'
import * as customersCharts from './customersCharts'
import { CustomersTab } from './CustomersTab'

const mockGet = vi.mocked(client.getAnalyticsCustomers)
const mockBuildDistribution = vi.mocked(customersCharts.buildRatingsDistributionBarConfig)
const mockBuildTrend = vi.mocked(customersCharts.buildRatingsTrendLineConfig)

const defaultParams: AnalyticsCustomersParams = {
  from: '2026-09-01',
  to: '2026-09-07',
  granularity: 'day',
  compare: false,
}

const fullResponse: AnalyticsCustomersResponse = {
  totalRides: 150,
  totalRevenueCzk: 75000,
  newIdentities: 40,
  returningIdentities: 60,
  repeatRate: 60.0,
  freqOne: 30,
  freqTwoToFive: 20,
  freqSixPlus: 10,
  newVsReturningBuckets: [
    { bucket: '2026-09-01', newRides: 20, returningRides: 30 },
    { bucket: '2026-09-02', newRides: 15, returningRides: 35 },
  ],
  cohortRows: [
    { acqMonthLabel: '2026-07', monthsSince: 0, activeCustomers: 100 },
    { acqMonthLabel: '2026-07', monthsSince: 1, activeCustomers: 60 },
  ],
  topCustomers: [
    { customerUserId: 'user-1', customerPhone: '+420777000001', customerName: 'Marie Nováková', rides: 25, revenueCzk: 12000 },
    { customerUserId: null, customerPhone: '+420777000002', customerName: null, rides: 10, revenueCzk: 4500 },
  ],
  ratings: {
    totalRated: 120,
    avgRating: 4.4,
    distribution: [
      { stars: 1, count: 5 },
      { stars: 2, count: 8 },
      { stars: 3, count: 12 },
      { stars: 4, count: 40 },
      { stars: 5, count: 55 },
    ],
    avgTrend: [
      { bucket: '2026-09-01', rides: 10, avgRating: 4.2 },
      { bucket: '2026-09-02', rides: 12, avgRating: 4.6 },
    ],
    worstRated: [
      {
        orderId: 'order-worst-1',
        publicCode: 'XYZ789',
        completedAt: '2026-09-03T15:00:00Z',
        ratingStars: 1,
        ratingComment: 'Příšerná jízda',
        driverName: 'Jan Novák',
      },
    ],
  },
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
})

describe('CustomersTab', () => {
  it('shows a loading state while fetching', () => {
    mockGet.mockReturnValue(new Promise(() => {}))
    render(createElement(CustomersTab, { params: defaultParams }), { wrapper: makeWrapper() })
    expect(screen.getByText(/načítám zákazníky/i)).toBeInTheDocument()
  })

  it('shows an error state when fetching fails', async () => {
    mockGet.mockRejectedValue(new Error('network error'))
    render(createElement(CustomersTab, { params: defaultParams }), { wrapper: makeWrapper() })
    expect(await screen.findByText(/nepodařilo se načíst/i)).toBeInTheDocument()
  })

  it('shows the new vs returning chart section', async () => {
    mockGet.mockResolvedValue(fullResponse)
    render(createElement(CustomersTab, { params: defaultParams }), { wrapper: makeWrapper() })
    expect(await screen.findByRole('heading', { name: /noví vs\. vracející/i })).toBeInTheDocument()
  })

  it('builds ratings distribution/trend charts with i18n-derived dataset labels', async () => {
    mockGet.mockResolvedValue(fullResponse)
    render(createElement(CustomersTab, { params: defaultParams }), { wrapper: makeWrapper() })
    await screen.findByRole('heading', { name: /noví vs\. vracející/i })
    // W3: dataset labels (tooltip-visible) must pass through useTranslation,
    // not fall back to the builders' hardcoded Czech defaults.
    expect(mockBuildDistribution).toHaveBeenCalledWith(
      fullResponse.ratings.distribution,
      i18n.t('analytics.customers.ratings.distribution.datasetLabel'),
    )
    expect(mockBuildTrend).toHaveBeenCalledWith(
      fullResponse.ratings.avgTrend,
      i18n.t('analytics.customers.ratings.avgRating'),
    )
  })

  it('shows summary stats: repeat rate', async () => {
    mockGet.mockResolvedValue(fullResponse)
    render(createElement(CustomersTab, { params: defaultParams }), { wrapper: makeWrapper() })
    await screen.findByRole('heading', { name: /noví vs\. vracející/i })
    expect(screen.getByText(/míra opakování/i)).toBeInTheDocument()
  })

  it('shows top customer names (unmasked)', async () => {
    mockGet.mockResolvedValue(fullResponse)
    render(createElement(CustomersTab, { params: defaultParams }), { wrapper: makeWrapper() })
    expect(await screen.findByText('Marie Nováková')).toBeInTheDocument()
  })

  it('shows the cohort table', async () => {
    mockGet.mockResolvedValue(fullResponse)
    render(createElement(CustomersTab, { params: defaultParams }), { wrapper: makeWrapper() })
    await screen.findByRole('heading', { name: /kohortová retence/i })
    expect(screen.getByText('2026-07')).toBeInTheDocument()
  })

  it('shows worst-rated order code', async () => {
    mockGet.mockResolvedValue(fullResponse)
    render(createElement(CustomersTab, { params: defaultParams }), { wrapper: makeWrapper() })
    expect(await screen.findByText('XYZ789')).toBeInTheDocument()
  })

  it('has a cohort CSV export button', async () => {
    mockGet.mockResolvedValue(fullResponse)
    render(createElement(CustomersTab, { params: defaultParams }), { wrapper: makeWrapper() })
    await screen.findByRole('heading', { name: /kohortová retence/i })
    expect(screen.getByRole('button', { name: /exportovat csv/i })).toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    mockGet.mockResolvedValue(fullResponse)
    const { container } = render(createElement(CustomersTab, { params: defaultParams }), {
      wrapper: makeWrapper(),
    })
    await screen.findByText('Marie Nováková')
    expect(await axe(container)).toHaveNoViolations()
  })
})

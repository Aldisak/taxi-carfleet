import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'
import { theme } from '../../shared/theme/theme'
import i18n from '../../shared/i18n'
import { axe } from '../../shared/test/axe'

vi.mock('../../shared/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/api/client')>()
  return { ...actual, getAdminAnalytics: vi.fn() }
})

const downloadCsvMock = vi.fn()
vi.mock('../../shared/csv/toCsv', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/csv/toCsv')>()
  return { ...actual, downloadCsv: (...args: unknown[]) => downloadCsvMock(...args) }
})

import * as client from '../../shared/api/client'
import { PlatformScreen } from './PlatformScreen'

const mockGet = vi.mocked(client.getAdminAnalytics)

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

function fleetRow(overrides?: Partial<client.FleetHealthRow>): client.FleetHealthRow {
  return {
    fleetId: '11111111-1111-1111-1111-111111111111',
    fleetName: 'Taxi Demo',
    ridesThisMonth: 120,
    ridesLastMonth: 100,
    revenueThisMonthCzk: 240000,
    revenueLastMonthCzk: 200000,
    momDeltaPct: 20,
    activeDrivers: 8,
    activeCustomers: 60,
    smsCount: 300,
    smsEstimatedCostCzk: 900,
    lastOrderAt: '2026-09-14T08:00:00Z',
    sparklineWeeks: [3, 5, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14],
    health: 'growing',
    ...overrides,
  }
}

function response(overrides?: Partial<client.AdminAnalyticsResponse>): client.AdminAnalyticsResponse {
  return {
    fleets: [fleetRow()],
    totals: {
      totalFleets: 1,
      totalRidesThisMonth: 120,
      totalRevenueThisMonthCzk: 240000,
      growingFleets: 1,
      decliningFleets: 0,
      inactiveFleets: 0,
    },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  i18n.changeLanguage('cs-CZ')
  mockGet.mockResolvedValue(response())
})

describe('PlatformScreen (UC-009 WI-16)', () => {
  it('renders a per-fleet health row with the fleet name and rides', async () => {
    render(createElement(PlatformScreen), { wrapper: makeWrapper() })
    expect(await screen.findByText('Taxi Demo')).toBeInTheDocument()
    // 120 appears in both the fleet row and the totals (single fleet), so match by cell count.
    expect(screen.getAllByText('120').length).toBeGreaterThan(0)
  })

  it('renders the server health flag label (growing → Roste), not a recomputed band', async () => {
    render(createElement(PlatformScreen), { wrapper: makeWrapper() })
    expect(await screen.findByText('Roste')).toBeInTheDocument()
  })

  it('renders the declining band label for a declining fleet', async () => {
    mockGet.mockResolvedValue(
      response({
        fleets: [fleetRow({ health: 'declining', momDeltaPct: -15 })],
        totals: {
          totalFleets: 1,
          totalRidesThisMonth: 120,
          totalRevenueThisMonthCzk: 240000,
          growingFleets: 0,
          decliningFleets: 1,
          inactiveFleets: 0,
        },
      }),
    )
    render(createElement(PlatformScreen), { wrapper: makeWrapper() })
    expect(await screen.findByText('Klesá')).toBeInTheDocument()
  })

  it('renders a platform totals row', async () => {
    render(createElement(PlatformScreen), { wrapper: makeWrapper() })
    expect(await screen.findByText('Souhrn platformy')).toBeInTheDocument()
  })

  it('renders an accessible SVG sparkline (role=img with a name)', async () => {
    render(createElement(PlatformScreen), { wrapper: makeWrapper() })
    await screen.findByText('Taxi Demo')
    const spark = screen.getByRole('img', { name: /Taxi Demo/ })
    expect(spark).toBeInTheDocument()
  })

  it('shows the empty state when there are no fleets', async () => {
    mockGet.mockResolvedValue(
      response({
        fleets: [],
        totals: {
          totalFleets: 0,
          totalRidesThisMonth: 0,
          totalRevenueThisMonthCzk: 0,
          growingFleets: 0,
          decliningFleets: 0,
          inactiveFleets: 0,
        },
      }),
    )
    render(createElement(PlatformScreen), { wrapper: makeWrapper() })
    expect(await screen.findByText('Zatím zde nejsou žádné flotily.')).toBeInTheDocument()
  })

  it('shows an error state when the query fails', async () => {
    mockGet.mockRejectedValue(new Error('boom'))
    render(createElement(PlatformScreen), { wrapper: makeWrapper() })
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Přehled platformy se nepodařilo načíst.',
    )
  })

  it('exports the table to CSV when the export button is clicked', async () => {
    const user = userEvent.setup()
    render(createElement(PlatformScreen), { wrapper: makeWrapper() })
    await screen.findByText('Taxi Demo')
    await user.click(screen.getByRole('button', { name: 'Exportovat CSV' }))
    expect(downloadCsvMock).toHaveBeenCalledTimes(1)
    const [csv, filename] = downloadCsvMock.mock.calls[0]
    expect(csv).toContain('Taxi Demo')
    expect(filename).toBe('prehled-platformy.csv')
  })

  it('has no axe violations', async () => {
    const { container } = render(createElement(PlatformScreen), { wrapper: makeWrapper() })
    await screen.findByText('Taxi Demo')
    expect(await axe(container)).toHaveNoViolations()
  })
})

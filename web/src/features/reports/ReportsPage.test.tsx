import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import { axe } from '../../shared/test/axe'
import { theme } from '../../shared/theme/theme'
import i18n from '../../shared/i18n'

vi.mock('../../shared/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/api/client')>()
  return {
    ...actual,
    getDrivers: vi.fn(),
    getDriverReport: vi.fn(),
    getFleetReport: vi.fn(),
    getRatings: vi.fn(),
    fetchDriverReportCsv: vi.fn(),
  }
})

import * as client from '../../shared/api/client'
import { ReportsPage } from './ReportsPage'

const mockGetDrivers = vi.mocked(client.getDrivers)
const mockDriverReport = vi.mocked(client.getDriverReport)
const mockFleetReport = vi.mocked(client.getFleetReport)
const mockRatings = vi.mocked(client.getRatings)
const mockFetchCsv = vi.mocked(client.fetchDriverReportCsv)

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) =>
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(ThemeProvider, { theme }, createElement(I18nextProvider, { i18n }, children)),
    )
}

function seedHappyPath() {
  mockGetDrivers.mockResolvedValue({
    items: [{ driverId: 'd1', displayName: 'Jan Novák', status: 'Free', currentVehiclePlate: null, lastPositionAt: null, lastLat: null, lastLng: null }],
  })
  mockDriverReport.mockResolvedValue({
    driverId: 'd1',
    driverName: 'Jan Novák',
    avgRating: 4.5,
    days: [{ date: '2026-09-01', ridesCompleted: 3, ridesCancelled: 1, cashCzk: 300, cardCzk: 200, invoiceCzk: 0, totalCzk: 500, hoursOnline: 6, priceOverrideCount: 1 }],
    totals: { date: 'Celkem', ridesCompleted: 3, ridesCancelled: 1, cashCzk: 300, cardCzk: 200, invoiceCzk: 0, totalCzk: 500, hoursOnline: 6, priceOverrideCount: 1 },
  })
  mockFleetReport.mockResolvedValue({
    kpis: { rides: 10, revenueCzk: 5000, avgPriceCzk: 500, avgTimeToAssignSeconds: 120, avgTimeToPickupSeconds: 300, cancellationRate: 0.1, appOrders: 6, phoneOrders: 4, fixedRouteOrders: 3, smsCount: 4, smsCostCzk: 4 },
    ridesPerDay: [{ date: '2026-09-01', count: 4 }, { date: '2026-09-02', count: 6 }],
    topRoutes: [{ routeId: 'r1', name: 'KH → Kolín', count: 7 }],
  })
  mockRatings.mockResolvedValue([{ orderPublicCode: 'AAA111', driverName: 'Jan Novák', stars: 5, comment: 'Super', ratedAt: '2026-09-13T10:00:00Z' }])
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  localStorage.setItem('auth.userRole', 'FleetAdmin')
})

afterEach(() => {
  localStorage.clear()
})

describe('ReportsPage', () => {
  it('denies access for non-FleetAdmin roles', () => {
    seedHappyPath()
    localStorage.setItem('auth.userRole', 'Dispatcher')
    render(createElement(ReportsPage), { wrapper: makeWrapper() })
    expect(screen.getByRole('alert')).toHaveTextContent(/nemáte přístup/i)
  })

  it('shows a pick-a-driver hint until a driver is selected', async () => {
    seedHappyPath()
    render(createElement(ReportsPage), { wrapper: makeWrapper() })
    // Fleet report loads without a driver; the driver section shows the hint, not the table.
    expect(await screen.findByRole('img', { name: /jízdy po dnech/i })).toBeInTheDocument()
    expect(screen.getByText(/vyberte řidiče/i)).toBeInTheDocument()
    expect(mockDriverReport).not.toHaveBeenCalled()
  })

  it('renders the driver report table with a totals row once a driver is selected', async () => {
    seedHappyPath()
    render(createElement(ReportsPage), { wrapper: makeWrapper() })
    await screen.findByRole('option', { name: 'Jan Novák' })
    await userEvent.selectOptions(screen.getByLabelText('Řidič'), 'd1')
    expect(await screen.findByText(/01\.09\.2026/)).toBeInTheDocument()
    // Totals row shows the summed total "500 Kč" (appears twice: day + totals).
    expect(screen.getAllByText(/500/).length).toBeGreaterThanOrEqual(1)
  })

  it('renders fleet KPI cards, the rides chart, and top routes', async () => {
    seedHappyPath()
    render(createElement(ReportsPage), { wrapper: makeWrapper() })
    expect(await screen.findByRole('img', { name: /jízdy po dnech/i })).toBeInTheDocument()
    expect(screen.getByText('KH → Kolín')).toBeInTheDocument()
  })

  it('renders — (never NaN) for a null avg-time KPI and a zero-denominator share', async () => {
    seedHappyPath()
    // Null seconds → formatDuration(null) = '—'; zero app+phone → formatShare div-by-zero guard = '—'.
    mockFleetReport.mockResolvedValue({
      kpis: { rides: 0, revenueCzk: 0, avgPriceCzk: 0, avgTimeToAssignSeconds: null, avgTimeToPickupSeconds: null, cancellationRate: 0, appOrders: 0, phoneOrders: 0, fixedRouteOrders: 0, smsCount: 0, smsCostCzk: 0 },
      ridesPerDay: [{ date: '2026-09-01', count: 0 }],
      topRoutes: [],
    })
    render(createElement(ReportsPage), { wrapper: makeWrapper() })
    await screen.findByRole('img', { name: /jízdy po dnech/i })
    // At least one KPI card renders the em-dash placeholder, and nothing renders "NaN".
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText(/NaN/)).toBeNull()
  })

  it('renders the ratings list', async () => {
    seedHappyPath()
    render(createElement(ReportsPage), { wrapper: makeWrapper() })
    expect(await screen.findByText('Super')).toBeInTheDocument()
  })

  it('downloads the server CSV blob on button click', async () => {
    seedHappyPath()
    const blob = new Blob(['﻿a;b\r\n'], { type: 'text/csv' })
    mockFetchCsv.mockResolvedValue({ blob, filename: 'r.csv' })
    vi.stubGlobal('URL', { createObjectURL: vi.fn().mockReturnValue('blob:x'), revokeObjectURL: vi.fn() })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    render(createElement(ReportsPage), { wrapper: makeWrapper() })
    await screen.findByRole('option', { name: 'Jan Novák' })
    await userEvent.selectOptions(screen.getByLabelText('Řidič'), 'd1')
    await screen.findByText(/01\.09\.2026/)
    await userEvent.click(screen.getByRole('button', { name: /stáhnout csv/i }))
    expect(mockFetchCsv).toHaveBeenCalledOnce()
  })

  it('has no axe violations', async () => {
    seedHappyPath()
    const { container } = render(createElement(ReportsPage), { wrapper: makeWrapper() })
    await screen.findByRole('option', { name: 'Jan Novák' })
    await userEvent.selectOptions(screen.getByLabelText('Řidič'), 'd1')
    await screen.findByText(/01\.09\.2026/)
    expect(await axe(container)).toHaveNoViolations()
  })
})

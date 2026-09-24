import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
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
  return {
    ...actual,
    getAdminFleets: vi.fn(),
    getAdminAnalytics: vi.fn(),
    postCreateFleet: vi.fn(),
    postDeactivateFleet: vi.fn(),
  }
})

import * as client from '../../shared/api/client'
import { AdminFleetsPage } from './AdminFleetsPage'

const mockGetAdminFleets = vi.mocked(client.getAdminFleets)
const mockGetAdminAnalytics = vi.mocked(client.getAdminAnalytics)
const mockPostCreateFleet = vi.mocked(client.postCreateFleet)

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

function fleet(overrides?: Partial<client.AdminFleetDto>): client.AdminFleetDto {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    slug: 'demo',
    name: 'Taxi Demo',
    phone: '+420321700100',
    isActive: true,
    createdAt: '2026-09-01T12:00:00Z',
    ...overrides,
  }
}

function healthRow(overrides?: Partial<client.FleetHealthRow>): client.FleetHealthRow {
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

function analytics(
  fleets: client.FleetHealthRow[],
): client.AdminAnalyticsResponse {
  return {
    fleets,
    totals: {
      totalFleets: fleets.length,
      totalRidesThisMonth: 0,
      totalRevenueThisMonthCzk: 0,
      growingFleets: 0,
      decliningFleets: 0,
      inactiveFleets: 0,
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetAdminFleets.mockResolvedValue({ items: [fleet()] })
  mockGetAdminAnalytics.mockResolvedValue(analytics([healthRow()]))
})

describe('AdminFleetsPage (UC-021 WI-7)', () => {
  it('lists existing fleets with slug + phone', async () => {
    render(createElement(AdminFleetsPage), { wrapper: makeWrapper() })
    expect(await screen.findByText('Taxi Demo')).toBeInTheDocument()
    expect(screen.getByText(/demo/)).toBeInTheDocument()
  })

  it('shows a summary of total + active fleets', async () => {
    mockGetAdminFleets.mockResolvedValue({
      items: [fleet(), fleet({ id: '2', slug: 'kolin', name: 'Taxi Kolín', isActive: false })],
    })
    render(createElement(AdminFleetsPage), { wrapper: makeWrapper() })
    await screen.findByText('Taxi Demo')
    expect(screen.getByText('2 flotil · 1 aktivních')).toBeInTheDocument()
  })

  it('enriches a row with drivers count and rides/month from analytics', async () => {
    render(createElement(AdminFleetsPage), { wrapper: makeWrapper() })
    await screen.findByText('Taxi Demo')
    const row = screen.getByText('Taxi Demo').closest('tr') as HTMLElement
    expect(within(row).getByText('8')).toBeInTheDocument() // drivers
    expect(within(row).getByText('120')).toBeInTheDocument() // rides/month
  })

  it('renders a 12-week sparkline and a trend pill per row', async () => {
    render(createElement(AdminFleetsPage), { wrapper: makeWrapper() })
    await screen.findByText('Taxi Demo')
    // Sparkline SVG with an accessible label.
    expect(screen.getByRole('img', { name: /Trend jízd za 12 týdnů/ })).toBeInTheDocument()
    // Trend pill uses the health band label.
    expect(screen.getByText('Roste')).toBeInTheDocument()
  })

  it('creates a fleet and shows the one-time password once with a copy button', async () => {
    const user = userEvent.setup()
    mockPostCreateFleet.mockResolvedValue({
      fleetId: '22222222-2222-2222-2222-222222222222',
      slug: 'kolin',
      adminEmail: 'admin@kolin.local',
      oneTimePassword: 'Zx7Kp9Qw2Rt4Vb6',
    })
    render(createElement(AdminFleetsPage), { wrapper: makeWrapper() })
    await screen.findByText('Taxi Demo')

    const form = screen.getByRole('form', { name: 'Vytvořit novou flotilu' })
    await user.type(within(form).getByLabelText('Identifikátor (slug)'), 'kolin')
    await user.type(within(form).getByLabelText('Název'), 'Taxi Kolín')
    await user.type(within(form).getByLabelText('Telefon'), '+420321123456')
    await user.type(within(form).getByLabelText('E-mail správce'), 'admin@kolin.local')
    await user.click(within(form).getByRole('button', { name: 'Vytvořit flotilu' }))

    await waitFor(() => expect(mockPostCreateFleet).toHaveBeenCalledTimes(1))
    expect(mockPostCreateFleet).toHaveBeenCalledWith({
      slug: 'kolin',
      name: 'Taxi Kolín',
      phone: '+420321123456',
      adminEmail: 'admin@kolin.local',
    })
    expect(await screen.findByTestId('one-time-password')).toHaveTextContent('Zx7Kp9Qw2Rt4Vb6')
    expect(screen.getByRole('button', { name: 'Kopírovat' })).toBeInTheDocument()
  })

  it('copies the one-time password to the clipboard', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    mockPostCreateFleet.mockResolvedValue({
      fleetId: '2',
      slug: 'kolin',
      adminEmail: 'admin@kolin.local',
      oneTimePassword: 'Zx7Kp9Qw2Rt4Vb6',
    })
    render(createElement(AdminFleetsPage), { wrapper: makeWrapper() })
    await screen.findByText('Taxi Demo')

    const form = screen.getByRole('form', { name: 'Vytvořit novou flotilu' })
    await user.type(within(form).getByLabelText('Identifikátor (slug)'), 'kolin')
    await user.type(within(form).getByLabelText('Název'), 'Taxi Kolín')
    await user.type(within(form).getByLabelText('Telefon'), '+420321123456')
    await user.type(within(form).getByLabelText('E-mail správce'), 'admin@kolin.local')
    await user.click(within(form).getByRole('button', { name: 'Vytvořit flotilu' }))

    await screen.findByTestId('one-time-password')
    await user.click(screen.getByRole('button', { name: 'Kopírovat' }))
    expect(writeText).toHaveBeenCalledWith('Zx7Kp9Qw2Rt4Vb6')
    expect(await screen.findByRole('button', { name: 'Zkopírováno' })).toBeInTheDocument()
  })

  it('blocks submit and shows errors when the form is invalid', async () => {
    const user = userEvent.setup()
    render(createElement(AdminFleetsPage), { wrapper: makeWrapper() })
    await screen.findByText('Taxi Demo')

    const form = screen.getByRole('form', { name: 'Vytvořit novou flotilu' })
    await user.type(within(form).getByLabelText('Identifikátor (slug)'), 'NOT VALID')
    await user.click(within(form).getByRole('button', { name: 'Vytvořit flotilu' }))

    expect(mockPostCreateFleet).not.toHaveBeenCalled()
    expect(within(form).getAllByRole('alert').length).toBeGreaterThan(0)
  })

  it('renders a Settings link per fleet row pointing at the settings route', async () => {
    render(createElement(AdminFleetsPage), { wrapper: makeWrapper() })
    await screen.findByText('Taxi Demo')
    const settingsLink = screen.getByRole('link', { name: 'Nastavení' })
    expect(settingsLink).toHaveAttribute(
      'href',
      '/admin/fleets/11111111-1111-1111-1111-111111111111/settings',
    )
  })

  it('has no axe violations', async () => {
    const { container } = render(createElement(AdminFleetsPage), { wrapper: makeWrapper() })
    await screen.findByText('Taxi Demo')
    expect(await axe(container)).toHaveNoViolations()
  })
})

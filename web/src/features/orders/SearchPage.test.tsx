import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import type { ReactNode } from 'react'
import { theme } from '../../shared/theme/theme'
import i18n from '../../shared/i18n'
import { axe } from '../../shared/test/axe'
import { SearchPage } from './SearchPage'
import type { OrderSummaryDto } from '../../shared/api/client'

vi.mock('../../shared/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/api/client')>()
  return {
    ...actual,
    getOrders: vi.fn(),
    getDrivers: vi.fn(),
  }
})

import * as client from '../../shared/api/client'

const mockGetOrders = vi.mocked(client.getOrders)
const mockGetDrivers = vi.mocked(client.getDrivers)

function makeOrder(overrides?: Partial<OrderSummaryDto>): OrderSummaryDto {
  return {
    id: 'o1',
    publicCode: 'KH-100',
    status: 'InProgress',
    customerPhone: '+420600111222',
    customerName: 'Jan Novák',
    pickupAddress: 'Náměstí 1',
    dropoffAddress: 'Kutná Hora',
    scheduledAt: null,
    priceType: 'Estimate',
    estimatedPriceCzk: 150,
    fixedPriceCzk: null,
    driverId: 'd1',
    createdAt: '2026-09-10T10:00:00Z',
    ...overrides,
  } as OrderSummaryDto
}

function wrap(children: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <I18nextProvider i18n={i18n}>
          <MemoryRouter initialEntries={['/dispatcher/orders']}>
            <Routes>
              <Route path="/dispatcher/orders" element={children} />
              <Route
                path="/dispatcher/orders/:id"
                element={<div data-testid="drawer-open">drawer</div>}
              />
            </Routes>
          </MemoryRouter>
        </I18nextProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetDrivers.mockResolvedValue({
    items: [{ driverId: 'd1', displayName: 'Karel Šimek' } as never],
  } as never)
  mockGetOrders.mockResolvedValue({
    items: [makeOrder()],
    total: 1,
  } as never)
})

describe('SearchPage — desk kit restyle', () => {
  it('shows the panel title Objednávky', async () => {
    render(wrap(<SearchPage />))
    expect(await screen.findByText(i18n.t('nav.orders'))).toBeInTheDocument()
  })

  it('shows the result count', async () => {
    render(wrap(<SearchPage />))
    expect(await screen.findByText(i18n.t('search.resultCount', { count: 1 }))).toBeInTheDocument()
  })

  it('renders a semantic table with column headers', async () => {
    render(wrap(<SearchPage />))
    await screen.findByRole('table')
    expect(screen.getByRole('columnheader', { name: i18n.t('search.table.code') })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: i18n.t('search.table.status') })).toBeInTheDocument()
  })

  it('renders the per-row exact status as a DeskPill (Probíhá for InProgress)', async () => {
    render(wrap(<SearchPage />))
    expect(await screen.findByText(i18n.t('status.order.InProgress'))).toBeInTheDocument()
  })

  it('opens the drawer route when the code cell button is activated (keyboard/AT path)', async () => {
    const user = userEvent.setup()
    render(wrap(<SearchPage />))
    const rowButton = await screen.findByRole('button', { name: 'KH-100' })
    await user.click(rowButton)
    expect(await screen.findByTestId('drawer-open')).toBeInTheDocument()
  })

  it('opens the drawer route when a non-code cell in the row is clicked (whole-row mouse path)', async () => {
    const user = userEvent.setup()
    render(wrap(<SearchPage />))
    // Click the customer cell text, not the code button — the whole row is clickable.
    const customerCell = await screen.findByText(/Jan Novák/)
    await user.click(customerCell)
    expect(await screen.findByTestId('drawer-open')).toBeInTheDocument()
  })

  it('has the Exportovat CSV action', async () => {
    render(wrap(<SearchPage />))
    expect(
      await screen.findByRole('button', { name: i18n.t('search.filters.exportCsv') }),
    ).toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    const { container } = render(wrap(<SearchPage />))
    await screen.findByRole('table')
    expect(await axe(container)).toHaveNoViolations()
  })
})

describe('SearchPage — pagination', () => {
  it('renders outline prev/next when there is more than one page', async () => {
    mockGetOrders.mockResolvedValue({
      items: [makeOrder()],
      total: 120,
    } as never)
    render(wrap(<SearchPage />))
    expect(await screen.findByRole('button', { name: i18n.t('search.pagination.prev') })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: i18n.t('search.pagination.next') })).toBeInTheDocument()
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route, useParams, useLocation } from 'react-router-dom'
import i18n from '../../../shared/i18n'
import { theme } from '../../../shared/theme/theme'
import { axe } from '../../../shared/test/axe'

vi.mock('../../../shared/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../../shared/api/client')>(
    '../../../shared/api/client',
  )
  return { ...actual, getMyOrderHistory: vi.fn() }
})

vi.mock('../../../shared/api/auth-storage', () => ({
  authStorage: { getAccessToken: vi.fn(() => 'tok') },
}))

import { getMyOrderHistory, type MyOrderHistoryResponse } from '../../../shared/api/client'
import { CustomerHistoryPage } from './CustomerHistoryPage'

const mockHistory = vi.mocked(getMyOrderHistory)

function TrackingProbe() {
  const { code } = useParams<{ code: string }>()
  return <div>tracking /c/t/{code}</div>
}

/** Probe that renders the reorder draft passed via router state, proving the state shape. */
function CustomOrderProbe() {
  const location = useLocation()
  const state = location.state as { reorder?: { pickupAddress: string; dropoffAddress: string | null } } | null
  return (
    <div data-testid="custom-order">
      custom pickup=[{state?.reorder?.pickupAddress ?? ''}] dropoff=[{state?.reorder?.dropoffAddress ?? ''}]
    </div>
  )
}

const page: MyOrderHistoryResponse = {
  items: [
    {
      id: 'o1',
      publicCode: 'ABC123',
      status: 'Completed',
      pickupAddress: 'Hlavní 1, Praha',
      dropoffAddress: 'Náměstí 5',
      priceType: 'Fixed',
      fixedPriceCzk: 150,
      finalPriceCzk: 200,
      ratingStars: 4,
      createdAt: '2026-09-10T08:00:00Z',
      completedAt: '2026-09-10T08:20:00Z',
    },
  ],
  total: 1,
  page: 1,
  pageSize: 20,
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={theme}>
        <I18nextProvider i18n={i18n}>
          <MemoryRouter initialEntries={['/c/history']}>
            <Routes>
              <Route path="/c/history" element={<CustomerHistoryPage />} />
              <Route path="/c/t/:code" element={<TrackingProbe />} />
              <Route path="/c/order/new" element={<CustomOrderProbe />} />
            </Routes>
          </MemoryRouter>
        </I18nextProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  )
}

describe('CustomerHistoryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders a row with the route, price and status', async () => {
    mockHistory.mockResolvedValue(page)
    renderPage()

    expect(await screen.findByText(/Hlavní 1, Praha/)).toBeInTheDocument()
    expect(screen.getByText(/Náměstí 5/)).toBeInTheDocument()
    expect(screen.getByText(/200 Kč/)).toBeInTheDocument()
    expect(screen.getByText(/Dokončeno/)).toBeInTheDocument()
  })

  it('navigates to read-only tracking when a row is tapped', async () => {
    mockHistory.mockResolvedValue(page)
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('link', { name: /Zobrazit jízdu ABC123/ }))
    await waitFor(() => expect(screen.getByText(/\/c\/t\/ABC123/)).toBeInTheDocument())
  })

  it('Objednat znovu navigates to the custom order screen prefilled', async () => {
    mockHistory.mockResolvedValue(page)
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: /Objednat znovu/ }))
    const probe = await screen.findByTestId('custom-order')
    expect(probe).toHaveTextContent('pickup=[Hlavní 1, Praha]')
    expect(probe).toHaveTextContent('dropoff=[Náměstí 5]')
  })

  it('shows an empty state when there are no rides', async () => {
    mockHistory.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 })
    renderPage()

    expect(await screen.findByText(/Zatím žádné jízdy/)).toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    mockHistory.mockResolvedValue(page)
    const { container } = renderPage()
    await screen.findByText(/Hlavní 1, Praha/)
    expect(await axe(container)).toHaveNoViolations()
  })
})

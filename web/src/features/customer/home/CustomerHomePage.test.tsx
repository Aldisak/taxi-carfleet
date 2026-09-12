import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import i18n from '../../../shared/i18n'
import { theme } from '../../../shared/theme/theme'

vi.mock('../../../shared/api/client', () => ({
  getCommonRoutes: vi.fn(),
  getMyActiveOrder: vi.fn(),
  getPublicFleet: vi.fn(),
}))

import { getCommonRoutes, getMyActiveOrder, getPublicFleet } from '../../../shared/api/client'
import { CustomerHomePage } from './CustomerHomePage'

const mockRoutes = vi.mocked(getCommonRoutes)
const mockActive = vi.mocked(getMyActiveOrder)
const mockFleet = vi.mocked(getPublicFleet)

function LocationProbe() {
  const loc = useLocation()
  return <div data-testid="location">{loc.pathname}</div>
}

function renderHome() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={theme}>
        <I18nextProvider i18n={i18n}>
          <MemoryRouter initialEntries={['/c']}>
            <Routes>
              <Route path="/c" element={<CustomerHomePage />} />
              <Route path="/c/order/new" element={<LocationProbe />} />
              <Route path="/c/order/route/:routeId" element={<LocationProbe />} />
            </Routes>
          </MemoryRouter>
        </I18nextProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  )
}

describe('CustomerHomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    localStorage.setItem('auth.accessToken', 'customer-token')
    mockFleet.mockResolvedValue({ name: 'Acme', phone: '+420111222333', primaryColorHex: null, currency: 'CZK', timeZone: 'Europe/Prague' })
  })

  it('renders common-route cards when routes are valid-now and no active order', async () => {
    mockRoutes.mockResolvedValue([{ id: 'r1', name: 'Nádraží → Centrum', type: 'PointToPoint', priceCzk: 110 }])
    mockActive.mockResolvedValue(null)
    renderHome()
    expect(await screen.findByText('Nádraží → Centrum')).toBeInTheDocument()
    expect(screen.getByText(/110\s*Kč/)).toBeInTheDocument()
  })

  it('shows the active-order banner (replacing routes) when the customer has an active order', async () => {
    mockRoutes.mockResolvedValue([{ id: 'r1', name: 'Nádraží → Centrum', type: 'PointToPoint', priceCzk: 110 }])
    mockActive.mockResolvedValue({ id: 'o1', publicCode: 'K7F2A9', status: 'Assigned' })
    renderHome()
    expect(await screen.findByText(/K7F2A9/)).toBeInTheDocument()
    expect(screen.queryByText('Nádraží → Centrum')).not.toBeInTheDocument()
  })

  it('hides the routes block when no routes are valid-now', async () => {
    mockRoutes.mockResolvedValue([])
    mockActive.mockResolvedValue(null)
    renderHome()
    // Custom-address button is always present; the routes title is not.
    expect(await screen.findByRole('button', { name: /vlastní adresa/i })).toBeInTheDocument()
    expect(screen.queryByText(/oblíbené trasy/i)).not.toBeInTheDocument()
  })

  it('shows common-route cards to a LOGGED-OUT visitor (AC#1, routes/common is anonymous)', async () => {
    // No token: the previous hasToken gate hid routes from fresh visitors; routes/common
    // is now AllowAnonymous (laneA4b), so a logged-out visitor must still see the cards.
    localStorage.removeItem('auth.accessToken')
    mockRoutes.mockResolvedValue([{ id: 'r1', name: 'Nádraží → Centrum', type: 'PointToPoint', priceCzk: 110 }])
    mockActive.mockResolvedValue(null)
    renderHome()
    expect(await screen.findByText('Nádraží → Centrum')).toBeInTheDocument()
    expect(mockRoutes).toHaveBeenCalled()
    // The per-customer active-order query stays token-gated — not called when logged out.
    expect(mockActive).not.toHaveBeenCalled()
  })

  it('navigates to custom order on "Vlastní adresa"', async () => {
    const user = userEvent.setup()
    mockRoutes.mockResolvedValue([])
    mockActive.mockResolvedValue(null)
    renderHome()
    await user.click(await screen.findByRole('button', { name: /vlastní adresa/i }))
    expect(screen.getByTestId('location')).toHaveTextContent('/c/order/new')
  })
})

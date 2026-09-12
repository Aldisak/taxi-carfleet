import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import i18n from '../../../shared/i18n'
import { theme } from '../../../shared/theme/theme'
import { axe } from '../../../shared/test/axe'
import type { CommonRouteDto } from '../../../shared/api/client'

// Leaflet body is stubbed so jsdom never loads react-leaflet (Zone pickup map).
vi.mock('./PickupMapInner', () => ({ default: () => <div data-testid="fake-map" /> }))

vi.mock('../../../shared/api/client', () => ({
  postCreateOrder: vi.fn(),
  requestCustomerCode: vi.fn(),
  verifyCustomerCode: vi.fn(),
  getGeoSuggest: vi.fn(),
  getPriceQuote: vi.fn(),
}))

import { postCreateOrder, requestCustomerCode, verifyCustomerCode, getGeoSuggest, getPriceQuote } from '../../../shared/api/client'
import { RouteOrderPage } from './RouteOrderPage'

const mockCreate = vi.mocked(postCreateOrder)
const mockRequestCode = vi.mocked(requestCustomerCode)
const mockVerifyCode = vi.mocked(verifyCustomerCode)
const mockSuggest = vi.mocked(getGeoSuggest)
const mockQuote = vi.mocked(getPriceQuote)

const p2p: CommonRouteDto = {
  id: 'r1',
  name: 'Nádraží → Centrum',
  type: 'PointToPoint',
  priceCzk: 110,
  pickupAddress: 'Nádraží → Centrum',
  pickupLat: 50.0875,
  pickupLng: 14.4213,
  dropoffAddress: 'Nádraží → Centrum',
  dropoffLat: 50.0801,
  dropoffLng: 14.4289,
}
const zone: CommonRouteDto = { id: 'r2', name: 'Centrum', type: 'Zone', priceCzk: 90 }

function LocationProbe() {
  const loc = useLocation()
  return <div data-testid="location">{loc.pathname}</div>
}

function renderPage(route: CommonRouteDto = p2p) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={theme}>
        <I18nextProvider i18n={i18n}>
          <MemoryRouter initialEntries={[{ pathname: `/c/order/route/${route.id}`, state: { route } }]}>
            <Routes>
              <Route path="/c/order/route/:routeId" element={<RouteOrderPage />} />
              <Route path="/c/t/:code" element={<LocationProbe />} />
              <Route path="/c" element={<LocationProbe />} />
            </Routes>
          </MemoryRouter>
        </I18nextProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  )
}

describe('RouteOrderPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('shows the big fixed price and the locked journey for a PointToPoint route', () => {
    renderPage(p2p)
    expect(screen.getByText(/110\s*Kč/)).toBeInTheDocument()
    expect(screen.getByText('Nádraží → Centrum')).toBeInTheDocument()
    // PointToPoint: no pickup address entry, only the optional note.
    expect(screen.getByLabelText(/kde přesně/i)).toBeInTheDocument()
  })

  it('Zone route: an in-zone pickup yields a Fixed quote and the order carries the matched routeId', async () => {
    const user = userEvent.setup()
    localStorage.setItem('auth.accessToken', 'customer-token')
    // The server quote matches the Zone route → Fixed (pickup is inside the zone).
    mockQuote.mockResolvedValue({ type: 'Fixed', priceCzk: 110, routeId: 'r2', routeName: 'Centrum' })
    mockSuggest.mockResolvedValue({ items: [{ label: 'Palackého nám. 1, Kutná Hora', lat: 49.948, lng: 15.268 }] })
    mockCreate.mockResolvedValue({
      order: {
        id: 'o2', publicCode: 'ZONE01', status: 'New', source: 'App', customerPhone: '+420111222333',
        customerName: null, pickupAddress: 'Palackého nám. 1, Kutná Hora', pickupLat: 49.948, pickupLng: 15.268,
        dropoffAddress: null, dropoffLat: null, dropoffLng: null, scheduledAt: null, note: null,
        passengers: 1, priceType: 'Fixed', estimatedPriceCzk: null, fixedPriceCzk: 110,
        finalPriceCzk: null, paymentType: null, driverId: null, vehicleId: null,
        createdAt: '2026-09-12T12:00:00Z', updatedAt: '2026-09-12T12:00:00Z', allowedActions: [], version: 0,
      },
    })

    renderPage(zone)
    await user.type(screen.getByLabelText(/odkud vás vyzvedneme/i), 'Palack')
    await user.click(await screen.findByRole('option', { name: /palackého nám/i }))

    // The in-zone confirmation surfaces once the Fixed quote resolves.
    expect(await screen.findByText(/v zóně – cena je pevná/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^objednat$/i }))
    expect(mockCreate).toHaveBeenCalledTimes(1)
    const payload = mockCreate.mock.calls[0][0]
    expect(payload.priceType).toBe('Fixed')
    expect(payload.routeId).toBe('r2')
    expect(payload.fixedPriceCzk).toBe(110)
    expect(payload.pickupLat).toBe(49.948)
    expect(await screen.findByTestId('location')).toHaveTextContent('/c/t/ZONE01')
  })

  it('Zone route, LOGGED OUT: an in-zone pickup reaches the inline login (quote runs anonymously by slug)', async () => {
    const user = userEvent.setup()
    // No access token, but a fleet slug is present → the quote must resolve anonymously.
    localStorage.setItem('auth.fleetSlug', 'demo')
    mockQuote.mockResolvedValue({ type: 'Fixed', priceCzk: 110, routeId: 'r2', routeName: 'Centrum' })
    mockRequestCode.mockResolvedValue(undefined)

    // Logged out: no suggest dropdown, so resolve the in-zone pickup via a stubbed GPS pin.
    const getCurrentPosition = vi.fn((success: PositionCallback) =>
      success({ coords: { latitude: 49.948, longitude: 15.268 } } as GeolocationPosition),
    )
    vi.stubGlobal('navigator', { ...navigator, onLine: true, geolocation: { getCurrentPosition } })

    renderPage(zone)
    await user.click(screen.getByRole('button', { name: /použít moji polohu/i }))

    // The in-zone confirmation resolves even without a token.
    expect(await screen.findByText(/v zóně – cena je pevná/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^objednat$/i }))

    // The customer is offered the inline login — NOT an "outside zone" error.
    expect(screen.getByRole('button', { name: /odeslat kód/i })).toBeInTheDocument()
    expect(screen.queryByText(/mimo zónu/i)).not.toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it('Zone route: an out-of-zone pickup (non-Fixed quote) shows "mimo zónu" and blocks the order', async () => {
    const user = userEvent.setup()
    localStorage.setItem('auth.accessToken', 'customer-token')
    // The server quote does NOT match the Zone route → Meter (pickup is outside the zone).
    mockQuote.mockResolvedValue({ type: 'Meter', baseCzk: 40, perKmCzk: 30, minimumCzk: 60 })
    mockSuggest.mockResolvedValue({ items: [{ label: 'Někde daleko', lat: 48.0, lng: 16.0 }] })

    renderPage(zone)
    await user.type(screen.getByLabelText(/odkud vás vyzvedneme/i), 'Někde')
    await user.click(await screen.findByRole('option', { name: /někde daleko/i }))

    expect(await screen.findByText(/mimo zónu/i)).toBeInTheDocument()
    // The order button is disabled while the pickup is outside the zone.
    expect(screen.getByRole('button', { name: /^objednat$/i })).toBeDisabled()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('when not logged in, Objednat shows the inline login without losing the form state', async () => {
    const user = userEvent.setup()
    renderPage(p2p)
    // Bump passengers to 3 first so we can prove the form state survives the login step.
    await user.click(screen.getByRole('button', { name: /přidat cestujícího/i }))
    await user.click(screen.getByRole('button', { name: /přidat cestujícího/i }))
    expect(screen.getByText('3')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^objednat$/i }))

    // Inline login surfaces (phone step) and the passenger count is still 3.
    expect(screen.getByText(/přihlaste/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /odeslat kód/i })).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('when logged in, Objednat creates the order with the right payload and navigates to tracking', async () => {
    const user = userEvent.setup()
    localStorage.setItem('auth.accessToken', 'customer-token')
    mockCreate.mockResolvedValue({
      order: {
        id: 'o1', publicCode: 'K7F2A9', status: 'New', source: 'App', customerPhone: '+420111222333',
        customerName: null, pickupAddress: 'Nádraží → Centrum', pickupLat: 0, pickupLng: 0,
        dropoffAddress: null, dropoffLat: null, dropoffLng: null, scheduledAt: null, note: null,
        passengers: 1, priceType: 'Fixed', estimatedPriceCzk: null, fixedPriceCzk: 110,
        finalPriceCzk: null, paymentType: null, driverId: null, vehicleId: null,
        createdAt: '2026-09-12T12:00:00Z', updatedAt: '2026-09-12T12:00:00Z', allowedActions: [], version: 0,
      },
    })

    renderPage(p2p)
    await user.click(screen.getByRole('button', { name: /^objednat$/i }))

    expect(mockCreate).toHaveBeenCalledTimes(1)
    const payload = mockCreate.mock.calls[0][0]
    expect(payload.routeId).toBe('r1')
    expect(payload.priceType).toBe('Fixed')
    expect(payload.fixedPriceCzk).toBe(110)
    expect(payload.passengers).toBe(1)
    // AC#1 reconciliation #2: real route coords/address are threaded into create (no 0-stub).
    expect(payload.pickupAddress).toBe('Nádraží → Centrum')
    expect(payload.pickupLat).toBe(50.0875)
    expect(payload.pickupLng).toBe(14.4213)
    expect(payload.dropoffLat).toBe(50.0801)
    expect(payload.dropoffLng).toBe(14.4289)

    expect(await screen.findByTestId('location')).toHaveTextContent('/c/t/K7F2A9')
  })

  it('creates the order after completing the inline login (form state preserved)', async () => {
    const user = userEvent.setup()
    mockRequestCode.mockResolvedValue(undefined)
    mockVerifyCode.mockResolvedValue({
      accessToken: 'at', refreshToken: 'rt',
      user: { id: 'u1', phone: '+420777111222', displayName: 'Zákazník', role: 'Customer' },
    })
    mockCreate.mockResolvedValue({
      order: {
        id: 'o9', publicCode: 'Z9Z9Z9', status: 'New', source: 'App', customerPhone: '+420777111222',
        customerName: null, pickupAddress: 'Nádraží → Centrum', pickupLat: 0, pickupLng: 0,
        dropoffAddress: null, dropoffLat: null, dropoffLng: null, scheduledAt: null, note: null,
        passengers: 2, priceType: 'Fixed', estimatedPriceCzk: null, fixedPriceCzk: 110,
        finalPriceCzk: null, paymentType: null, driverId: null, vehicleId: null,
        createdAt: '2026-09-12T12:00:00Z', updatedAt: '2026-09-12T12:00:00Z', allowedActions: [], version: 0,
      },
    })

    renderPage(p2p)
    await user.click(screen.getByRole('button', { name: /přidat cestujícího/i })) // passengers → 2
    await user.click(screen.getByRole('button', { name: /^objednat$/i }))

    // Phone step
    await user.type(screen.getByLabelText(/telefonní číslo/i), '777111222')
    await user.click(screen.getByRole('button', { name: /odeslat kód/i }))
    // Code step auto-submits on 6 digits
    await user.type(await screen.findByLabelText(/ověřovací kód/i), '123456')

    // Order is created with the preserved passenger count and we navigate to tracking.
    expect(await screen.findByTestId('location')).toHaveTextContent('/c/t/Z9Z9Z9')
    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(mockCreate.mock.calls[0][0].passengers).toBe(2)
  })

  it('has no axe violations', async () => {
    const { container } = renderPage(p2p)
    expect(await axe(container)).toHaveNoViolations()
  })
})

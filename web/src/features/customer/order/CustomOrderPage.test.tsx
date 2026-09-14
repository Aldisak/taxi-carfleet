import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import i18n from '../../../shared/i18n'
import { theme } from '../../../shared/theme/theme'
import { axe } from '../../../shared/test/axe'

// Leaflet body is stubbed so jsdom never loads react-leaflet.
vi.mock('./PickupMapInner', () => ({ default: () => <div data-testid="fake-map" /> }))

vi.mock('../../../shared/api/client', () => ({
  getGeoSuggest: vi.fn(),
  getPriceQuote: vi.fn(),
  postCreateOrder: vi.fn(),
  requestCustomerCode: vi.fn(),
  verifyCustomerCode: vi.fn(),
}))

import { getGeoSuggest, getPriceQuote, postCreateOrder, requestCustomerCode, verifyCustomerCode } from '../../../shared/api/client'
import { CustomOrderPage } from './CustomOrderPage'

const mockSuggest = vi.mocked(getGeoSuggest)
const mockQuote = vi.mocked(getPriceQuote)
const mockCreate = vi.mocked(postCreateOrder)
const mockRequestCode = vi.mocked(requestCustomerCode)
const mockVerifyCode = vi.mocked(verifyCustomerCode)

function LocationProbe() {
  const loc = useLocation()
  return <div data-testid="location">{loc.pathname}</div>
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={theme}>
        <I18nextProvider i18n={i18n}>
          <MemoryRouter initialEntries={['/customer/order/new']}>
            <Routes>
              <Route path="/customer/order/new" element={<CustomOrderPage />} />
              <Route path="/customer/t/:code" element={<LocationProbe />} />
            </Routes>
          </MemoryRouter>
        </I18nextProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  )
}

async function pickPickup(user: ReturnType<typeof userEvent.setup>) {
  mockSuggest.mockResolvedValue({ items: [{ label: 'Hlavní 1, Praha', lat: 50.0875, lng: 14.4213 }] })
  await user.type(screen.getByLabelText(/odkud vás vyzvedneme/i), 'Hlavní')
  await user.click(await screen.findByRole('option', { name: /hlavní 1, praha/i }))
}

describe('CustomOrderPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    localStorage.clear()
    localStorage.setItem('auth.accessToken', 'customer-token')
  })

  it('shows an ESTIMATE RANGE once a pickup is chosen — never a single exact number (AC #4)', async () => {
    const user = userEvent.setup()
    mockQuote.mockResolvedValue({ type: 'Estimate', lowCzk: 180, highCzk: 220, distanceKm: 12.4, durationMin: 18 })
    renderPage()
    await pickPickup(user)

    const badge = await screen.findByText(/odhad/i)
    expect(badge).toHaveTextContent(/180\s*Kč/)
    expect(badge).toHaveTextContent(/220\s*Kč/)
    expect(badge.textContent).not.toMatch(/^Odhad\s+\d+\s*Kč$/)
    expect(mockQuote).toHaveBeenCalled()
  })

  it('prefills pickup and dropoff addresses from a reorder draft passed via router state', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <ThemeProvider theme={theme}>
          <I18nextProvider i18n={i18n}>
            <MemoryRouter
              initialEntries={[
                {
                  pathname: '/customer/order/new',
                  state: { reorder: { pickupAddress: 'Hlavní 1, Praha', dropoffAddress: 'Náměstí 5' } },
                },
              ]}
            >
              <Routes>
                <Route path="/customer/order/new" element={<CustomOrderPage />} />
              </Routes>
            </MemoryRouter>
          </I18nextProvider>
        </ThemeProvider>
      </QueryClientProvider>,
    )

    expect(screen.getByLabelText(/odkud vás vyzvedneme/i)).toHaveValue('Hlavní 1, Praha')
    expect(screen.getByLabelText(/kam jedete/i)).toHaveValue('Náměstí 5')
  })

  it('disables Objednat until a pickup location with coords is chosen', async () => {
    const user = userEvent.setup()
    mockQuote.mockResolvedValue({ type: 'Estimate', lowCzk: 180, highCzk: 220, distanceKm: 12.4, durationMin: 18 })
    renderPage()
    expect(screen.getByRole('button', { name: /^objednat$/i })).toBeDisabled()
    await pickPickup(user)
    await waitFor(() => expect(screen.getByRole('button', { name: /^objednat$/i })).toBeEnabled())
  })

  it('sends the resolved pickup coords/address in the create payload and navigates to tracking', async () => {
    const user = userEvent.setup()
    mockQuote.mockResolvedValue({ type: 'Estimate', lowCzk: 180, highCzk: 220, distanceKm: 12.4, durationMin: 18 })
    mockCreate.mockResolvedValue({
      order: {
        id: 'o1', publicCode: 'K7F2A9', status: 'New', source: 'App', customerPhone: '+420111222333',
        customerName: null, pickupAddress: 'Hlavní 1, Praha', pickupLat: 50.0875, pickupLng: 14.4213,
        dropoffAddress: null, dropoffLat: null, dropoffLng: null, scheduledAt: null, note: null,
        passengers: 1, priceType: 'Estimate', estimatedPriceCzk: null, fixedPriceCzk: null,
        finalPriceCzk: null, paymentType: null, driverId: null, vehicleId: null,
        createdAt: '2026-09-12T12:00:00Z', updatedAt: '2026-09-12T12:00:00Z', allowedActions: [], version: 0,
      },
    })
    renderPage()
    await pickPickup(user)
    await waitFor(() => expect(screen.getByRole('button', { name: /^objednat$/i })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: /^objednat$/i }))

    expect(mockCreate).toHaveBeenCalledTimes(1)
    const payload = mockCreate.mock.calls[0][0]
    expect(payload.pickupAddress).toBe('Hlavní 1, Praha')
    expect(payload.pickupLat).toBe(50.0875)
    expect(payload.pickupLng).toBe(14.4213)
    expect(payload.priceType).toBe('Estimate')
    expect(await screen.findByTestId('location')).toHaveTextContent('/customer/t/K7F2A9')
  })

  it('when logged out, Objednat shows the inline login WITHOUT losing the chosen pickup', async () => {
    const user = userEvent.setup()
    localStorage.removeItem('auth.accessToken')
    mockRequestCode.mockResolvedValue(undefined)
    mockVerifyCode.mockResolvedValue({
      accessToken: 'at', refreshToken: 'rt',
      user: { id: 'u1', phone: '+420777111222', displayName: 'Zákazník', role: 'Customer' },
    })
    mockCreate.mockResolvedValue({
      order: {
        id: 'o2', publicCode: 'Z9Z9Z9', status: 'New', source: 'App', customerPhone: '+420777111222',
        customerName: null, pickupAddress: 'Hlavní 1, Praha', pickupLat: 50.0875, pickupLng: 14.4213,
        dropoffAddress: null, dropoffLat: null, dropoffLng: null, scheduledAt: null, note: null,
        passengers: 1, priceType: 'Estimate', estimatedPriceCzk: null, fixedPriceCzk: null,
        finalPriceCzk: null, paymentType: null, driverId: null, vehicleId: null,
        createdAt: '2026-09-12T12:00:00Z', updatedAt: '2026-09-12T12:00:00Z', allowedActions: [], version: 0,
      },
    })
    renderPage()

    // Logged out: no suggest dropdown, but freeform typing + a stubbed GPS pin resolve coords.
    const getCurrentPosition = vi.fn((success: PositionCallback) =>
      success({ coords: { latitude: 50.0875, longitude: 14.4213 } } as GeolocationPosition),
    )
    vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition } })
    await user.click(screen.getByRole('button', { name: /použít moji polohu/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /^objednat$/i })).toBeEnabled())

    await user.click(screen.getByRole('button', { name: /^objednat$/i }))
    // Inline login surfaces; the pickup label is still present.
    expect(await screen.findByRole('button', { name: /odeslat kód/i })).toBeInTheDocument()
    expect(screen.getAllByDisplayValue(/moje poloha \(gps\)/i).length).toBeGreaterThan(0)

    // Complete the login → order is created with the preserved pickup coords.
    await user.type(screen.getByLabelText(/telefonní číslo/i), '777111222')
    await user.click(screen.getByRole('button', { name: /odeslat kód/i }))
    await user.type(await screen.findByLabelText(/ověřovací kód/i), '123456')

    expect(await screen.findByTestId('location')).toHaveTextContent('/customer/t/Z9Z9Z9')
    expect(mockCreate.mock.calls[0][0].pickupLat).toBe(50.0875)
  })

  it('disables ordering while offline (spec §Behavior — the phone fallback stays in the layout)', async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    mockQuote.mockResolvedValue({ type: 'Estimate', lowCzk: 180, highCzk: 220, distanceKm: 12.4, durationMin: 18 })
    renderPage()
    await pickPickup(user)
    // Even with a resolved pickup, Objednat is disabled offline and no order is created.
    expect(screen.getByRole('button', { name: /^objednat$/i })).toBeDisabled()
    expect(mockCreate).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  it('has no axe violations', async () => {
    const { container } = renderPage()
    expect(await axe(container)).toHaveNoViolations()
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import i18n from '../../../shared/i18n'
import { theme } from '../../../shared/theme/theme'
import { axe } from '../../../shared/test/axe'

vi.mock('./TrackingMapInner', () => ({ default: () => <div data-testid="fake-map" /> }))

// Stub the hub so no live connection is attempted.
vi.mock('../../../shared/realtime/useFleetHub', () => ({
  useFleetHub: vi.fn(),
  useHubConnectionState: () => 'connected',
  invokeHub: vi.fn().mockResolvedValue(true),
}))

vi.mock('../../../shared/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../../shared/api/client')>(
    '../../../shared/api/client',
  )
  return {
    ...actual,
    getOrderByCode: vi.fn(),
    getPublicTrack: vi.fn(),
    getMyActiveOrder: vi.fn(),
    getOrder: vi.fn(),
    postCancelOrder: vi.fn(),
    // RatingForm (mounted on authed+Completed) calls getMyOrderHistory; stub it defensively so a
    // future authed-Completed TrackingPage test never hits a real fetch.
    getMyOrderHistory: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
  }
})

vi.mock('../../../shared/api/auth-storage', () => ({
  authStorage: { getAccessToken: vi.fn(), getFleetPhone: vi.fn(() => '+420123456789') },
}))

import {
  getOrderByCode,
  getPublicTrack,
  getMyActiveOrder,
  getOrder,
  postCancelOrder,
  ApiResponseError,
} from '../../../shared/api/client'
import type { TrackDto, MyActiveOrderDto, OrderDetailDto } from '../../../shared/api/client'
import { authStorage } from '../../../shared/api/auth-storage'
import { TrackingPage } from './TrackingPage'

const mockByCode = vi.mocked(getOrderByCode)
const mockPublic = vi.mocked(getPublicTrack)
const mockActive = vi.mocked(getMyActiveOrder)
const mockOrder = vi.mocked(getOrder)
const mockCancel = vi.mocked(postCancelOrder)
const mockToken = vi.mocked(authStorage.getAccessToken)

const dto: TrackDto = {
  publicCode: 'ABC123',
  status: 'Accepted',
  pickupAddress: 'Hlavní 1, Praha',
  dropoffAddress: 'Náměstí 5',
  scheduledAt: null,
  driverFirstName: 'Petr',
  vehiclePlate: '1AB 2345',
  vehicleColor: 'černá',
  position: { lat: 50.08, lng: 14.42 },
  etaMinutes: null,
  displayPriceCzk: 150,
}

const active: MyActiveOrderDto = { id: 'order-1', publicCode: 'ABC123', status: 'Accepted' }
const detail = {
  id: 'order-1',
  publicCode: 'ABC123',
  status: 'Accepted',
  driverId: 'driver-9',
  finalPriceCzk: null,
  fixedPriceCzk: 150,
  estimatedPriceCzk: null,
  pickupLat: 50.09,
  pickupLng: 14.43,
  dropoffAddress: 'Náměstí 5',
} as unknown as OrderDetailDto

function renderPage(initialPath: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={theme}>
        <I18nextProvider i18n={i18n}>
          <MemoryRouter initialEntries={[initialPath]}>
            <Routes>
              <Route path="/c/t/:code" element={<TrackingPage />} />
            </Routes>
          </MemoryRouter>
        </I18nextProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  )
}

describe('TrackingPage', () => {
  beforeEach(() => {
    mockByCode.mockReset()
    mockPublic.mockReset()
    mockActive.mockReset()
    mockOrder.mockReset()
    mockCancel.mockReset()
    mockToken.mockReset()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('authed mode: renders the Accepted headline with the driver name', async () => {
    mockToken.mockReturnValue('customer-token')
    mockByCode.mockResolvedValue(dto)
    mockActive.mockResolvedValue(active)
    mockOrder.mockResolvedValue(detail)

    renderPage('/c/t/ABC123')

    expect(await screen.findByText(/řidič petr je na cestě/i)).toBeInTheDocument()
    // Public poll is NOT used when authed.
    expect(mockPublic).not.toHaveBeenCalled()
  })

  it('public mode: polls public/track when logged out with a ?k= token', async () => {
    mockToken.mockReturnValue(null)
    mockPublic.mockResolvedValue(dto)

    renderPage('/c/t/ABC123?k=sometoken')

    expect(await screen.findByText(/řidič petr je na cestě/i)).toBeInTheDocument()
    expect(mockPublic).toHaveBeenCalledWith('ABC123', 'sometoken')
    expect(mockByCode).not.toHaveBeenCalled()
  })

  it('public mode 410: shows "Odkaz vypršel" and the call button', async () => {
    mockToken.mockReturnValue(null)
    mockPublic.mockRejectedValueOnce(
      new ApiResponseError(410, { status: 410, title: 'Gone', type: '' }),
    )

    renderPage('/c/t/ABC123?k=expiredtoken')

    expect(await screen.findByText(/odkaz vypršel/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /zavolat/i })).toBeInTheDocument()
  })

  it('shows the cancel button in Accepted and confirms via the dialog', async () => {
    mockToken.mockReturnValue('customer-token')
    mockByCode.mockResolvedValue(dto)
    mockActive.mockResolvedValue(active)
    mockOrder.mockResolvedValue(detail)
    mockCancel.mockResolvedValue({ order: {} as never })
    const user = userEvent.setup()

    renderPage('/c/t/ABC123')
    await screen.findByText(/řidič petr je na cestě/i)

    await user.click(screen.getByRole('button', { name: /zrušit objednávku/i }))
    // Dialog shows the post-accepted hint.
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/řidič už jede/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /ano, zrušit/i }))
    await waitFor(() => expect(mockCancel).toHaveBeenCalledWith('order-1', expect.any(String)))
  })

  it('keeps the cancel dialog open with an in-dialog error on a 409', async () => {
    mockToken.mockReturnValue('customer-token')
    mockByCode.mockResolvedValue(dto)
    mockActive.mockResolvedValue(active)
    mockOrder.mockResolvedValue(detail)
    mockCancel.mockRejectedValueOnce(new ApiResponseError(409, { status: 409, title: 'Conflict', type: '' }))
    const user = userEvent.setup()

    renderPage('/c/t/ABC123')
    await screen.findByText(/řidič petr je na cestě/i)

    await user.click(screen.getByRole('button', { name: /zrušit objednávku/i }))
    await user.click(screen.getByRole('button', { name: /ano, zrušit/i }))

    // Dialog stays open and shows the "cannot cancel anymore" message (not a stale-closure close).
    await waitFor(() => expect(screen.getByText(/objednávku už nelze zrušit/i)).toBeInTheDocument())
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('does not show cancel in Arrived', async () => {
    mockToken.mockReturnValue('customer-token')
    mockByCode.mockResolvedValue({ ...dto, status: 'Arrived' })
    mockActive.mockResolvedValue(null)

    renderPage('/c/t/ABC123')
    await screen.findByText(/řidič je na místě/i)
    expect(screen.queryByRole('button', { name: /zrušit objednávku/i })).not.toBeInTheDocument()
  })

  it('has no axe violations in authed mode', async () => {
    mockToken.mockReturnValue('customer-token')
    mockByCode.mockResolvedValue(dto)
    mockActive.mockResolvedValue(active)
    mockOrder.mockResolvedValue(detail)

    const { container } = renderPage('/c/t/ABC123')
    await screen.findByText(/řidič petr je na cestě/i)
    expect(await axe(container)).toHaveNoViolations()
  })
})

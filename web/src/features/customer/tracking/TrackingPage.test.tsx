import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import type { ReactNode } from 'react'
import i18n from '../../../shared/i18n'
import { theme } from '../../../shared/theme/theme'
import { axe } from '../../../shared/test/axe'
import type { LatLng } from '../shell/mapCamera'

// Stub the hub so no live connection is attempted.
vi.mock('../../../shared/realtime/useFleetHub', () => ({
  useFleetHub: vi.fn(),
  useHubConnectionState: () => 'connected',
  invokeHub: vi.fn().mockResolvedValue(true),
}))

// F1 (design-review HIGH): ensureFleetSlug must be persisted (synchronously, during render)
// BEFORE the public/track fetch fires — otherwise the logged-out public link 404s on localhost
// (CLAUDE.md -> "F-05 fleet-slug resolution + synchronous persist"). Mock it so a test can assert
// it was called before the fetch effect ran.
vi.mock('../shell/ensureFleetSlug', () => ({ ensureFleetSlug: vi.fn(() => 'demo') }))

// Stub the full-bleed map shell: echo the data props (carMarker/pickupMarker/cameraTarget) as
// attributes + render the slots so the page's prop-threading is asserted here (WI-3 already tests
// real leaflet marker/icon rendering + interpolation — TrackingPage only proves it threads coords).
vi.mock('../shell/CustomerMapShell', () => ({
  CustomerMapShell: ({
    bottomSlot,
    carMarker,
    pickupMarker,
    cameraTarget,
  }: {
    bottomSlot?: ReactNode
    carMarker?: LatLng | null
    pickupMarker?: LatLng | null
    cameraTarget?: LatLng[] | null
  }) => (
    <div
      data-testid="map-shell"
      data-car={carMarker ? JSON.stringify(carMarker) : ''}
      data-pickup={pickupMarker ? JSON.stringify(pickupMarker) : ''}
      data-camera={cameraTarget ? JSON.stringify(cameraTarget) : ''}
    >
      {bottomSlot}
    </div>
  ),
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
    // RatingForm (mounted on authed+Completed) calls getMyOrderHistory; stub it defensively.
    getMyOrderHistory: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
  }
})

vi.mock('../../../shared/api/auth-storage', () => ({
  authStorage: {
    getAccessToken: vi.fn(),
    getFleetPhone: vi.fn(() => '+420123456789'),
    getFleetSlug: vi.fn(() => 'demo'),
    setFleetSlug: vi.fn(),
  },
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
import { ensureFleetSlug } from '../shell/ensureFleetSlug'
import { usePositionStore } from '../../../shared/realtime/usePositionStore'
import { TrackingPage } from './TrackingPage'

const mockByCode = vi.mocked(getOrderByCode)
const mockPublic = vi.mocked(getPublicTrack)
const mockActive = vi.mocked(getMyActiveOrder)
const mockOrder = vi.mocked(getOrder)
const mockCancel = vi.mocked(postCancelOrder)
const mockToken = vi.mocked(authStorage.getAccessToken)
const mockEnsureSlug = vi.mocked(ensureFleetSlug)

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
              <Route path="/customer/t/:code" element={<TrackingPage />} />
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
    mockEnsureSlug.mockClear()
    usePositionStore.setState({ positions: new Map() })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('authed New: renders the searching sheet with a Cancel button', async () => {
    mockToken.mockReturnValue('customer-token')
    mockByCode.mockResolvedValue({ ...dto, status: 'New', driverFirstName: null })
    mockActive.mockResolvedValue({ ...active, status: 'New' })
    mockOrder.mockResolvedValue({ ...detail, status: 'New' })

    renderPage('/customer/t/ABC123')

    expect(await screen.findByRole('heading', { name: 'Hledáme řidiče…' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /zrušit objednávku/i })).toBeInTheDocument()
    expect(mockPublic).not.toHaveBeenCalled()
  })

  it('authed Accepted: renders the assigned headline with the driver name', async () => {
    mockToken.mockReturnValue('customer-token')
    mockByCode.mockResolvedValue(dto)
    mockActive.mockResolvedValue(active)
    mockOrder.mockResolvedValue(detail)

    renderPage('/customer/t/ABC123')

    expect(await screen.findByRole('heading', { name: /řidič petr je na cestě/i })).toBeInTheDocument()
  })

  it('authed: a live position in the store renders the car marker via the shell', async () => {
    mockToken.mockReturnValue('customer-token')
    mockByCode.mockResolvedValue(dto)
    mockActive.mockResolvedValue(active)
    mockOrder.mockResolvedValue(detail)
    usePositionStore.setState({
      positions: new Map([
        ['driver-9', { driverId: 'driver-9', lat: 50.05, lng: 14.5, heading: null, speed: null, at: '' }],
      ]),
    })

    renderPage('/customer/t/ABC123')
    await screen.findByRole('heading', { name: /řidič petr je na cestě/i })

    const shell = screen.getByTestId('map-shell')
    // Live store position wins over the DTO fallback (selectCarMarker).
    expect(shell).toHaveAttribute('data-car', JSON.stringify({ lat: 50.05, lng: 14.5 }))
    // Pickup marker comes from the full order detail.
    expect(shell).toHaveAttribute('data-pickup', JSON.stringify({ lat: 50.09, lng: 14.43 }))
    // Camera frames [car, pickup].
    expect(shell).toHaveAttribute(
      'data-camera',
      JSON.stringify([{ lat: 50.05, lng: 14.5 }, { lat: 50.09, lng: 14.43 }]),
    )
  })

  it('authed Cancelled: renders the cancelled sheet with the re-order CTA', async () => {
    mockToken.mockReturnValue('customer-token')
    mockByCode.mockResolvedValue({ ...dto, status: 'Cancelled' })
    mockActive.mockResolvedValue(null)

    renderPage('/customer/t/ABC123')

    expect(await screen.findByRole('heading', { name: 'Objednávka byla zrušena' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /objednat znovu/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /zrušit objednávku/i })).not.toBeInTheDocument()
  })

  it('public mode: renders the SAME sheet from the DTO (no cancel/rating)', async () => {
    mockToken.mockReturnValue(null)
    mockPublic.mockResolvedValue(dto)

    renderPage('/customer/t/ABC123?k=sometoken')

    expect(await screen.findByRole('heading', { name: /řidič petr je na cestě/i })).toBeInTheDocument()
    expect(mockPublic).toHaveBeenCalledWith('ABC123', 'sometoken')
    expect(mockByCode).not.toHaveBeenCalled()
    // No id in public mode → no cancel button.
    expect(screen.queryByRole('button', { name: /zrušit objednávku/i })).not.toBeInTheDocument()
  })

  it('public mode: omits the ETA line gracefully when etaMinutes is null', async () => {
    mockToken.mockReturnValue(null)
    // Accepted + null ETA → the assignedNoEta headline (no "~min"), never a crash.
    mockPublic.mockResolvedValue({ ...dto, etaMinutes: null })

    renderPage('/customer/t/ABC123?k=sometoken')

    expect(await screen.findByRole('heading', { name: /řidič petr je na cestě/i })).toBeInTheDocument()
    expect(screen.queryByText(/~/)).not.toBeInTheDocument()
  })

  it('public mode 410: shows the "Odkaz vypršel" heading and the call button', async () => {
    mockToken.mockReturnValue(null)
    mockPublic.mockRejectedValueOnce(
      new ApiResponseError(410, { status: 410, title: 'Gone', type: '' }),
    )

    renderPage('/customer/t/ABC123?k=expiredtoken')

    expect(await screen.findByRole('heading', { name: 'Odkaz vypršel' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /zavolat/i })).toBeInTheDocument()
  })

  it('F1: persists the fleet slug (ensureFleetSlug) before the public/track fetch fires', async () => {
    mockToken.mockReturnValue(null)
    mockPublic.mockResolvedValue(dto)

    renderPage('/customer/t/ABC123?k=sometoken')

    // ensureFleetSlug runs during render (useState initializer) — synchronously, before the
    // query's post-render fetch effect. Assert it was called at least once by the time (and
    // before) the public/track request resolves.
    await waitFor(() => expect(mockPublic).toHaveBeenCalled())
    expect(mockEnsureSlug).toHaveBeenCalled()
    // The slug call is invoked no later than the fetch — a useState initializer is structurally
    // guaranteed to run before any effect, so a single call before the awaited fetch resolution
    // is the pin.
    const slugOrder = mockEnsureSlug.mock.invocationCallOrder[0]
    const fetchOrder = mockPublic.mock.invocationCallOrder[0]
    expect(slugOrder).toBeLessThan(fetchOrder)
  })

  it('none mode (logged out, no token): shows the login-needed prompt', async () => {
    mockToken.mockReturnValue(null)

    renderPage('/customer/t/ABC123')

    expect(await screen.findByText(/pro sledování této jízdy se prosím přihlaste/i)).toBeInTheDocument()
    expect(mockPublic).not.toHaveBeenCalled()
    expect(mockByCode).not.toHaveBeenCalled()
  })

  it('cancel flow: confirm closes to the cancelled sheet', async () => {
    mockToken.mockReturnValue('customer-token')
    mockByCode.mockResolvedValue(dto)
    mockActive.mockResolvedValue(active)
    mockOrder.mockResolvedValue(detail)
    mockCancel.mockResolvedValue({ order: {} as never })
    const user = userEvent.setup()

    renderPage('/customer/t/ABC123')
    await screen.findByRole('heading', { name: /řidič petr je na cestě/i })

    await user.click(screen.getByRole('button', { name: /zrušit objednávku/i }))
    // The confirm dialog (scoped by name — the BottomSheet is also role=dialog).
    const dialog = screen.getByRole('dialog', { name: /zrušit objednávku\?/i })
    expect(dialog).toBeInTheDocument()
    expect(screen.getByText(/řidič už jede/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /ano, zrušit/i }))
    await waitFor(() => expect(mockCancel).toHaveBeenCalledWith('order-1', expect.any(String)))
  })

  it('cancel flow: a 409 keeps the dialog open with the in-dialog error', async () => {
    mockToken.mockReturnValue('customer-token')
    mockByCode.mockResolvedValue(dto)
    mockActive.mockResolvedValue(active)
    mockOrder.mockResolvedValue(detail)
    mockCancel.mockRejectedValueOnce(new ApiResponseError(409, { status: 409, title: 'Conflict', type: '' }))
    const user = userEvent.setup()

    renderPage('/customer/t/ABC123')
    await screen.findByRole('heading', { name: /řidič petr je na cestě/i })

    await user.click(screen.getByRole('button', { name: /zrušit objednávku/i }))
    await user.click(screen.getByRole('button', { name: /ano, zrušit/i }))

    await waitFor(() => expect(screen.getByText(/objednávku už nelze zrušit/i)).toBeInTheDocument())
    expect(screen.getByRole('dialog', { name: /zrušit objednávku\?/i })).toBeInTheDocument()
  })

  it('has no axe violations in authed assigned mode', async () => {
    mockToken.mockReturnValue('customer-token')
    mockByCode.mockResolvedValue(dto)
    mockActive.mockResolvedValue(active)
    mockOrder.mockResolvedValue(detail)

    const { container } = renderPage('/customer/t/ABC123')
    await screen.findByRole('heading', { name: /řidič petr je na cestě/i })
    expect(await axe(container)).toHaveNoViolations()
  })
})

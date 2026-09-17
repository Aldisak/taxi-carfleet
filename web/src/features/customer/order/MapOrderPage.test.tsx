import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../../shared/i18n'
import { theme } from '../../../shared/theme/theme'
import { axe } from '../../../shared/test/axe'
import type { LatLng } from '../shell/mapCamera'
import type { SelectedPlace } from './orderFlowState'

// ── Navigation ───────────────────────────────────────────────────────────────
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

// ── Shell: a lightweight stub that echoes the threaded props so the page's wiring
//    (camera points, onCenterChange, top/bottom slots) is assertable without leaflet. ──
let lastCameraTarget: LatLng[] | null | undefined
let lastOnCenterChange: ((coords: LatLng) => void) | undefined
let lastRouteGeometry: number[][] | null | undefined
vi.mock('../shell/CustomerMapShell', () => ({
  CustomerMapShell: (props: {
    topSlot?: React.ReactNode
    bottomSlot?: React.ReactNode
    cameraTarget?: LatLng[] | null
    onCenterChange?: (coords: LatLng) => void
    routeGeometry?: number[][] | null
  }) => {
    lastCameraTarget = props.cameraTarget
    lastOnCenterChange = props.onCenterChange
    lastRouteGeometry = props.routeGeometry
    return (
      <div data-testid="shell">
        <div data-testid="top-slot">{props.topSlot}</div>
        <div data-testid="bottom-slot">{props.bottomSlot}</div>
      </div>
    )
  },
}))

// ── useCustomerLocation: a controllable stub for the GPS hook. ──
const mockRequest = vi.fn()
const mockUseCustomerLocation = vi.fn<() => {
  coords: LatLng | null
  status: 'locating' | 'granted' | 'denied' | 'unavailable'
  request: () => void
}>(() => ({ coords: null, status: 'locating', request: mockRequest }))
vi.mock('../shell/useCustomerLocation', () => ({
  useCustomerLocation: () => mockUseCustomerLocation(),
}))

// ── useRoute: a controllable stub for the pickup->destination route-preview hook. ──
const mockUseRoute = vi.fn<(pickup: unknown, destination: unknown) => { geometry: number[][] | null; isLoading: boolean }>(
  () => ({ geometry: null, isLoading: false }),
)
vi.mock('./useRoute', () => ({
  useRoute: (pickup: unknown, destination: unknown) => mockUseRoute(pickup, destination),
}))

// ── DestinationSearch: a stub button that fires a fixed destination on click. It also captures
//    the threaded `near` prop so the page's best-location wiring is assertable. ──
const DESTINATION: SelectedPlace = { label: 'Náměstí 5, Kolín', lat: 50.028, lng: 15.2 }
let lastSearchNear: LatLng | null | undefined
vi.mock('./DestinationSearch', () => ({
  DestinationSearch: (props: { onSelectDestination: (p: SelectedPlace) => void; near?: LatLng | null }) => {
    lastSearchNear = props.near
    return (
      <button type="button" onClick={() => props.onSelectDestination(DESTINATION)}>
        pick-destination
      </button>
    )
  },
}))

// ── useGeoConfig: a controllable stub for the fleet default map center (config-center tier). ──
const mockUseGeoConfig = vi.fn<() => { data: { mapCenterLat: number; mapCenterLng: number } | undefined }>(
  () => ({ data: { mapCenterLat: 49.948, mapCenterLng: 15.268 } }),
)
vi.mock('../../../shared/map/useGeoConfig', () => ({
  useGeoConfig: () => mockUseGeoConfig(),
}))

// ── PriceSheet: a stub that exposes pickup/destination/onOrdered/onCancel. ──
let lastSheetPickup: SelectedPlace | null | undefined
vi.mock('./PriceSheet', () => ({
  PriceSheet: (props: {
    pickup: SelectedPlace | null
    destination: SelectedPlace | null
    onOrdered: (publicCode: string) => void
    onCancel: () => void
  }) => {
    lastSheetPickup = props.pickup
    return (
      <div data-testid="price-sheet">
        <span data-testid="sheet-destination">{props.destination?.label ?? ''}</span>
        <button type="button" onClick={() => props.onOrdered('K7F2A9')}>
          fire-ordered
        </button>
        <button type="button" onClick={() => props.onCancel()}>
          fire-cancel
        </button>
      </div>
    )
  },
}))

// ── usePriceQuote: a controllable stub (the page threads its pickup/destination coords in). ──
const mockUsePriceQuote = vi.fn<(args: unknown) => { view: unknown; isLoading: boolean; errorKey: string | null }>(
  () => ({ view: null, isLoading: false, errorKey: null }),
)
vi.mock('./usePriceQuote', () => ({
  usePriceQuote: (args: unknown) => mockUsePriceQuote(args),
}))

// ── useReverseGeocode: a controllable stub so onCenterChange -> pickup label can be driven. ──
const mockReverse = vi.fn<(coords: unknown) => { data: unknown }>(() => ({ data: undefined }))
vi.mock('../shell/useReverseGeocode', () => ({
  useReverseGeocode: (coords: unknown) => mockReverse(coords),
}))

import { MapOrderPage } from './MapOrderPage'

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/customer']}>
      <ThemeProvider theme={theme}>
        <I18nextProvider i18n={i18n}>
          <MapOrderPage />
        </I18nextProvider>
      </ThemeProvider>
    </MemoryRouter>,
  )
}

describe('MapOrderPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    lastCameraTarget = undefined
    lastOnCenterChange = undefined
    lastRouteGeometry = undefined
    lastSheetPickup = undefined
    lastSearchNear = undefined
    mockUsePriceQuote.mockReturnValue({ view: null, isLoading: false, errorKey: null })
    mockReverse.mockReturnValue({ data: undefined })
    mockUseGeoConfig.mockReturnValue({ data: { mapCenterLat: 49.948, mapCenterLng: 15.268 } })
    mockUseCustomerLocation.mockReturnValue({ coords: null, status: 'locating', request: mockRequest })
    mockUseRoute.mockReturnValue({ geometry: null, isLoading: false })
  })

  it('shows the destination search in the top slot and no price sheet initially', () => {
    renderPage()
    expect(screen.getByRole('button', { name: 'pick-destination' })).toBeInTheDocument()
    expect(screen.queryByTestId('price-sheet')).not.toBeInTheDocument()
  })

  it('shows the price sheet once a destination is selected', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'pick-destination' }))
    expect(screen.getByTestId('price-sheet')).toBeInTheDocument()
    expect(screen.getByTestId('sheet-destination')).toHaveTextContent(DESTINATION.label)
  })

  it('camera frames the pickup (setView) before a destination and pickup+destination (fitBounds) after', async () => {
    const user = userEvent.setup()
    // Reverse geocode resolves a pickup label for the initial center change.
    mockReverse.mockReturnValue({ data: { found: true, label: 'Odkud, Kolín', street: null, municipality: null } })
    renderPage()

    // Fire an initial center change so a pickup exists.
    act(() => lastOnCenterChange?.({ lat: 50.03, lng: 15.19 }))
    // A single pickup point → the shell receives one camera point.
    expect(lastCameraTarget).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'pick-destination' }))
    // Now pickup + destination → two points (the shell decides setView vs fitBounds).
    expect(lastCameraTarget).toHaveLength(2)
  })

  it('threads the resolved pickup coords into usePriceQuote once the shell reports a center', () => {
    mockReverse.mockReturnValue({ data: { found: true, label: 'Nádraží, Kolín', street: null, municipality: null } })
    renderPage()
    // Simulate the shell's initial center emit (the real CustomerMapShell/Background now fires this
    // on mount so the pickup defaults to the map center — no user drag required).
    act(() => lastOnCenterChange?.({ lat: 50.031, lng: 15.191 }))
    // usePriceQuote must have been called with the resolved (non-null) pickup coords → the quote
    // is enabled, so a map-landed customer sees a price without touching the map.
    const calls = mockUsePriceQuote.mock.calls.map((c) => c[0] as { pickupLat: number | null })
    expect(calls.some((a) => a.pickupLat === 50.031)).toBe(true)
  })

  it('falls back to the fleet config center as near before any map center is known (UC-018 WI-2)', () => {
    renderPage()
    // No onCenterChange fired yet → near comes from useGeoConfig, coarse-rounded to 2 decimals.
    expect(lastSearchNear).toEqual({ lat: 49.95, lng: 15.27 })
  })

  it('prefers the settled map center over the config center for near (UC-018 WI-2)', () => {
    renderPage()
    act(() => lastOnCenterChange?.({ lat: 50.0876, lng: 14.4312 }))
    // Map center wins, coarse-rounded to 2 decimals.
    expect(lastSearchNear).toEqual({ lat: 50.09, lng: 14.43 })
  })

  it('near is null while the fleet config center is still loading and no map center is known', () => {
    mockUseGeoConfig.mockReturnValue({ data: undefined })
    renderPage()
    expect(lastSearchNear).toBeNull()
  })

  it('onOrdered navigates to /customer/t/:code', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'pick-destination' }))
    await user.click(screen.getByRole('button', { name: 'fire-ordered' }))
    expect(mockNavigate).toHaveBeenCalledWith('/customer/t/K7F2A9')
  })

  it('onCancel returns to the search phase (hides the sheet)', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'pick-destination' }))
    expect(screen.getByTestId('price-sheet')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'fire-cancel' }))
    expect(screen.queryByTestId('price-sheet')).not.toBeInTheDocument()
  })

  it('freezes the pickup once a destination is set (center changes no longer overwrite it)', async () => {
    const user = userEvent.setup()
    mockReverse.mockReturnValue({ data: { found: true, label: 'Pickup A', street: null, municipality: null } })
    renderPage()
    act(() => lastOnCenterChange?.({ lat: 50.03, lng: 15.19 }))
    await user.click(screen.getByRole('button', { name: 'pick-destination' }))
    const pickupBefore = lastSheetPickup

    // A later center change (in destinationSet phase) must NOT change the frozen pickup.
    mockReverse.mockReturnValue({ data: { found: true, label: 'Mid-route B', street: null, municipality: null } })
    act(() => lastOnCenterChange?.({ lat: 50.05, lng: 15.25 }))
    expect(lastSheetPickup).toEqual(pickupBefore)
  })

  it('recenters the camera to the GPS coords on the first granted fix (route-preview-gps)', () => {
    mockUseCustomerLocation.mockReturnValue({
      coords: { lat: 50.0876, lng: 14.4312 },
      status: 'granted',
      request: mockRequest,
    })
    renderPage()
    // The one-shot GPS recenter drives the camera to [gps] (a single point → the shell setViews to
    // it → the center-pin → reverse-geocode → pickup = current location).
    expect(lastCameraTarget).toEqual([{ lat: 50.0876, lng: 14.4312 }])
  })

  it('reverts the camera to pickup+destination framing after the map settles on the GPS recenter', async () => {
    const user = userEvent.setup()
    mockUseCustomerLocation.mockReturnValue({
      coords: { lat: 50.0876, lng: 14.4312 },
      status: 'granted',
      request: mockRequest,
    })
    mockReverse.mockReturnValue({ data: { found: true, label: 'Moje poloha', street: null, municipality: null } })
    renderPage()
    // While the one-shot GPS recenter is active the camera is the single GPS point.
    expect(lastCameraTarget).toEqual([{ lat: 50.0876, lng: 14.4312 }])

    // The map settles on the recenter → onCenterChange fires → the one-shot recenter clears, so the
    // camera reverts to orderCameraPoints. Picking a destination now must yield TWO points — if the
    // recenter had NOT cleared, cameraTarget would stay locked at the single GPS point (length 1).
    act(() => lastOnCenterChange?.({ lat: 50.0876, lng: 14.4312 }))
    await user.click(screen.getByRole('button', { name: 'pick-destination' }))
    expect(lastCameraTarget).toHaveLength(2)
  })

  it('feeds the GPS coords into the suggest near tier when the map center is unknown', () => {
    mockUseCustomerLocation.mockReturnValue({
      coords: { lat: 50.0876, lng: 14.4312 },
      status: 'granted',
      request: mockRequest,
    })
    // No config center → GPS is the strongest available near (map center still unknown).
    mockUseGeoConfig.mockReturnValue({ data: undefined })
    renderPage()
    expect(lastSearchNear).toEqual({ lat: 50.09, lng: 14.43 })
  })

  it('threads the route-preview geometry to the shell', async () => {
    const user = userEvent.setup()
    const geometry = [
      [50.028, 15.2],
      [50.0, 15.1],
    ]
    mockUseRoute.mockReturnValue({ geometry, isLoading: false })
    renderPage()
    await user.click(screen.getByRole('button', { name: 'pick-destination' }))
    expect(lastRouteGeometry).toEqual(geometry)
  })

  it('shows a "Use my location" button that re-requests the fix on click', async () => {
    const user = userEvent.setup()
    renderPage()
    const btn = screen.getByRole('button', { name: i18n.t('customer.custom.useMyLocation') })
    await user.click(btn)
    expect(mockRequest).toHaveBeenCalled()
  })

  it('shows the denied message when geolocation permission is refused', () => {
    mockUseCustomerLocation.mockReturnValue({ coords: null, status: 'denied', request: mockRequest })
    renderPage()
    expect(screen.getByText(i18n.t('customer.shell.gpsDenied'))).toBeInTheDocument()
  })

  it('shows the unavailable message when geolocation is not supported', () => {
    mockUseCustomerLocation.mockReturnValue({ coords: null, status: 'unavailable', request: mockRequest })
    renderPage()
    expect(screen.getByText(i18n.t('customer.shell.gpsUnavailable'))).toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    const { container } = renderPage()
    expect(await axe(container)).toHaveNoViolations()
  })
})

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
vi.mock('../shell/CustomerMapShell', () => ({
  CustomerMapShell: (props: {
    topSlot?: React.ReactNode
    bottomSlot?: React.ReactNode
    cameraTarget?: LatLng[] | null
    onCenterChange?: (coords: LatLng) => void
  }) => {
    lastCameraTarget = props.cameraTarget
    lastOnCenterChange = props.onCenterChange
    return (
      <div data-testid="shell">
        <div data-testid="top-slot">{props.topSlot}</div>
        <div data-testid="bottom-slot">{props.bottomSlot}</div>
      </div>
    )
  },
}))

// ── DestinationSearch: a stub button that fires a fixed destination on click. ──
const DESTINATION: SelectedPlace = { label: 'Náměstí 5, Kolín', lat: 50.028, lng: 15.2 }
vi.mock('./DestinationSearch', () => ({
  DestinationSearch: (props: { onSelectDestination: (p: SelectedPlace) => void }) => (
    <button type="button" onClick={() => props.onSelectDestination(DESTINATION)}>
      pick-destination
    </button>
  ),
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
    lastSheetPickup = undefined
    mockUsePriceQuote.mockReturnValue({ view: null, isLoading: false, errorKey: null })
    mockReverse.mockReturnValue({ data: undefined })
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

  it('has no axe violations', async () => {
    const { container } = renderPage()
    expect(await axe(container)).toHaveNoViolations()
  })
})

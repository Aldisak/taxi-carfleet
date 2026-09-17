import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import type { ReactNode } from 'react'
import i18n from '../../../shared/i18n'
import { theme } from '../../../shared/theme/theme'
import { axe } from '../../../shared/test/axe'
import type { UseQueryResult } from '@tanstack/react-query'
import type { GeoConfigResponse } from '../../../shared/api/client'
import type { LatLng } from './centerPin'

// Captured react-leaflet controller hooks so the test can drive them imperatively.
const setView = vi.fn()
const fitBounds = vi.fn()
let mapCenter: LatLng = { lat: 50.03, lng: 15.2 }
// The moveend handler registered by the in-map MoveendController via useMapEvents.
let moveendHandler: (() => void) | null = null

// Mock react-leaflet so jsdom never mounts a real Leaflet map — MapContainer renders its
// children and exposes its aria-label as a data attr (mirrors MapyMap.test.tsx precedent).
// Marker echoes its position (JSON) as a data-attr and renders `title` as a plain title
// attribute (NOT aria-label — that would re-trigger the aria-prohibited-attr axe trap).
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children, ...rest }: { children?: ReactNode } & Record<string, unknown>) => (
    <div
      data-testid="map-container"
      role="application"
      aria-label={rest['aria-label'] as string | undefined}
    >
      {children}
    </div>
  ),
  TileLayer: ({ url, attribution }: { url: string; attribution?: string }) => (
    <div data-testid="tile-layer" data-url={url} data-attribution={attribution} />
  ),
  Marker: ({
    position,
    title,
    icon,
  }: {
    position: [number, number]
    title?: string
    icon?: { options?: { className?: string } }
  }) => (
    <div
      data-testid="leaflet-marker"
      data-position={JSON.stringify(position)}
      data-icon-class={icon?.options?.className}
      title={title}
    />
  ),
  useMap: () => ({
    setView,
    fitBounds,
    getZoom: () => 15,
    getCenter: () => mapCenter,
  }),
  useMapEvents: (handlers: { moveend?: () => void }) => {
    moveendHandler = handlers.moveend ?? null
    return { getZoom: () => 15, getCenter: () => mapCenter }
  },
}))

// leafletSetup runs an icon-fix side effect on import — stub it (MapyMap imports it).
vi.mock('../../../shared/map/leafletSetup', () => ({}))
vi.mock('../../../shared/map/useGeoConfig', () => ({ useGeoConfig: vi.fn() }))

import CustomerMapBackground, { MARKER_ANIMATION_MS } from './CustomerMapBackground'
import { useGeoConfig } from '../../../shared/map/useGeoConfig'

const CONFIG: GeoConfigResponse = {
  tileUrlTemplate: 'https://api.mapy.cz/v1/maptiles/basic/256/{z}/{x}/{y}?apikey={apikey}',
  browserKey: 'browser-key-123',
  attributionHtml: '<a href="https://api.mapy.cz/copyright">Mapy.cz</a>',
  mapCenterLat: 50.03,
  mapCenterLng: 15.2,
  mapZoom: 11,
}

function mockConfig(overrides: Partial<UseQueryResult<GeoConfigResponse>> = {}): void {
  vi.mocked(useGeoConfig).mockReturnValue({
    data: CONFIG,
    isLoading: false,
    isError: false,
    ...overrides,
  } as UseQueryResult<GeoConfigResponse>)
}

function renderBackground(props: React.ComponentProps<typeof CustomerMapBackground> = {}) {
  return render(
    <ThemeProvider theme={theme}>
      <I18nextProvider i18n={i18n}>
        <CustomerMapBackground {...props} />
      </I18nextProvider>
    </ThemeProvider>,
  )
}

// Manual requestAnimationFrame harness: vitest does not fake rAF/performance.now, so we queue
// the callbacks and flush them with explicit timestamps. The animated car marker computes
// elapsed from the timestamp rAF passes its callback, so flushing at chosen timestamps drives
// the animation deterministically (no wall-clock, no real frames).
let rafCallbacks: Array<(ts: number) => void> = []
function installRaf(): void {
  rafCallbacks = []
  vi.stubGlobal('requestAnimationFrame', (cb: (ts: number) => void) => {
    rafCallbacks.push(cb)
    return rafCallbacks.length
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
}
// Flush exactly the frames currently queued (a callback re-queues the next frame; flushing a
// snapshot avoids an unbounded loop) with the given timestamp.
function flushFrame(ts: number): void {
  const pending = rafCallbacks
  rafCallbacks = []
  for (const cb of pending) cb(ts)
}

function mockMatchMedia(reduced: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: reduced && query.includes('reduce'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
    })),
  )
}

describe('CustomerMapBackground', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
    setView.mockClear()
    fitBounds.mockClear()
    moveendHandler = null
    mapCenter = { lat: 50.03, lng: 15.2 }
    rafCallbacks = []
  })

  it('renders the map region with the shell aria-label (config resolved)', () => {
    mockConfig()
    renderBackground()
    const container = screen.getByTestId('map-container')
    expect(container).toHaveAttribute('aria-label', i18n.t('customer.shell.mapLabel'))
  })

  it('does not mount a real MapContainer before config resolves (loading state)', () => {
    mockConfig({ data: undefined, isLoading: true })
    renderBackground()
    expect(screen.queryByTestId('map-container')).not.toBeInTheDocument()
  })

  it('renders a center-pin overlay when onCenterChange is wired', () => {
    mockConfig()
    renderBackground({ onCenterChange: vi.fn() })
    expect(screen.getByTestId('center-pin')).toBeInTheDocument()
  })

  it('emits the settled initial map center once on mount (default GPS/center-pin pickup — UC-015)', () => {
    vi.useFakeTimers()
    mockConfig()
    mapCenter = { lat: 50.03, lng: 15.2 }
    const onCenterChange = vi.fn()
    renderBackground({ onCenterChange })

    // Without any user drag, the initial center is reported (through the same debounce) so the
    // pickup defaults to the config/GPS center — react-leaflet's initial `center` prop does NOT
    // fire moveend, so the map would otherwise never report a pickup.
    vi.advanceTimersByTime(400)
    expect(onCenterChange).toHaveBeenCalledWith({ lat: 50.03, lng: 15.2 })
  })

  it('fires onCenterChange with the map center after moveend settles (debounced)', () => {
    vi.useFakeTimers()
    mockConfig()
    const onCenterChange = vi.fn()
    renderBackground({ onCenterChange })

    mapCenter = { lat: 49.95, lng: 15.27 }
    expect(moveendHandler).not.toBeNull()
    moveendHandler!()

    // Not fired synchronously — the debounce window must elapse first.
    expect(onCenterChange).not.toHaveBeenCalled()
    vi.advanceTimersByTime(400)
    expect(onCenterChange).toHaveBeenCalledWith({ lat: 49.95, lng: 15.27 })
  })

  it('debounces rapid moveends to a single onCenterChange with the last center', () => {
    vi.useFakeTimers()
    mockConfig()
    const onCenterChange = vi.fn()
    renderBackground({ onCenterChange })

    mapCenter = { lat: 49.9, lng: 15.1 }
    moveendHandler!()
    vi.advanceTimersByTime(100)
    mapCenter = { lat: 49.95, lng: 15.27 }
    moveendHandler!()
    vi.advanceTimersByTime(400)

    expect(onCenterChange).toHaveBeenCalledTimes(1)
    expect(onCenterChange).toHaveBeenCalledWith({ lat: 49.95, lng: 15.27 })
  })

  it('drives the camera controller (fitBounds) when cameraTarget carries two points', () => {
    mockConfig()
    renderBackground({
      cameraTarget: [
        { lat: 49.948, lng: 15.268 },
        { lat: 49.95, lng: 15.271 },
      ],
    })
    expect(fitBounds).toHaveBeenCalledTimes(1)
    expect(setView).not.toHaveBeenCalled()
  })

  it('drives setView (clamped zoom) when cameraTarget carries a single point', () => {
    mockConfig()
    renderBackground({ cameraTarget: [{ lat: 49.948, lng: 15.268 }] })
    expect(setView).toHaveBeenCalledTimes(1)
    // zoom clamped to at least MIN_CAMERA_ZOOM (14); the map reports 15 so 15 wins.
    expect(setView).toHaveBeenCalledWith([49.948, 15.268], 15)
  })

  it('renders the pickup marker with the pickup icon class and i18n title', () => {
    mockConfig()
    mockMatchMedia(true)
    renderBackground({ pickupMarker: { lat: 49.95, lng: 15.27 } })
    const markers = screen.getAllByTestId('leaflet-marker')
    const pickup = markers.find((m) => m.getAttribute('data-icon-class') === 'tracking-pickup-icon')
    expect(pickup).toBeDefined()
    expect(pickup).toHaveAttribute('data-position', JSON.stringify([49.95, 15.27]))
    expect(pickup).toHaveAttribute('title', i18n.t('customer.tracking.pickupLabel'))
  })

  it('renders the car marker with the tracking-car-icon class and i18n title', () => {
    mockConfig()
    mockMatchMedia(true) // reduced-motion: car snaps to the target, no rAF loop
    renderBackground({ carMarker: { lat: 49.948, lng: 15.268 } })
    const car = screen
      .getAllByTestId('leaflet-marker')
      .find((m) => m.getAttribute('data-icon-class') === 'tracking-car-icon')
    expect(car).toBeDefined()
    expect(car).toHaveAttribute('data-position', JSON.stringify([49.948, 15.268]))
    expect(car).toHaveAttribute('title', i18n.t('customer.tracking.carLabel'))
  })

  it('renders no car marker when carMarker is null (pickup pin only)', () => {
    mockConfig()
    mockMatchMedia(true)
    renderBackground({ carMarker: null, pickupMarker: { lat: 49.95, lng: 15.27 } })
    const classes = screen
      .getAllByTestId('leaflet-marker')
      .map((m) => m.getAttribute('data-icon-class'))
    expect(classes).toContain('tracking-pickup-icon')
    expect(classes).not.toContain('tracking-car-icon')
  })

  it('renders no markers when both carMarker and pickupMarker are null', () => {
    mockConfig()
    mockMatchMedia(true)
    renderBackground({ carMarker: null, pickupMarker: null })
    expect(screen.queryByTestId('leaflet-marker')).not.toBeInTheDocument()
  })

  it('animates the car marker smoothly toward a new target over the update interval', () => {
    installRaf()
    mockMatchMedia(false) // motion allowed → interpolate frame by frame
    mockConfig()
    const { rerender } = renderBackground({ carMarker: { lat: 50.0, lng: 15.0 } })

    // First fix snaps (no prev) — the marker sits exactly on the first target.
    const firstCar = () =>
      screen
        .getAllByTestId('leaflet-marker')
        .find((m) => m.getAttribute('data-icon-class') === 'tracking-car-icon')!
    expect(firstCar()).toHaveAttribute('data-position', JSON.stringify([50.0, 15.0]))

    // A new target starts an animation from the current rendered position.
    rerender(
      <ThemeProvider theme={theme}>
        <I18nextProvider i18n={i18n}>
          <CustomerMapBackground carMarker={{ lat: 50.02, lng: 15.04 }} />
        </I18nextProvider>
      </ThemeProvider>,
    )

    // Frame 0 establishes the animation start timestamp (elapsed 0 → still at prev).
    act(() => flushFrame(0))
    // Halfway through the interval → strictly between prev and target on BOTH axes.
    act(() => flushFrame(MARKER_ANIMATION_MS / 2))
    const mid = JSON.parse(firstCar().getAttribute('data-position')!) as [number, number]
    expect(mid[0]).toBeGreaterThan(50.0)
    expect(mid[0]).toBeLessThan(50.02)
    expect(mid[1]).toBeGreaterThan(15.0)
    expect(mid[1]).toBeLessThan(15.04)

    // At/after the interval → exactly the target (interpolateCoord clamps).
    act(() => flushFrame(MARKER_ANIMATION_MS))
    expect(firstCar()).toHaveAttribute('data-position', JSON.stringify([50.02, 15.04]))
  })

  it('jumps the car marker directly to a new target under prefers-reduced-motion (no rAF)', () => {
    installRaf()
    mockMatchMedia(true) // reduced motion → shouldAnimate === false → jump, no frames
    mockConfig()
    const { rerender } = renderBackground({ carMarker: { lat: 50.0, lng: 15.0 } })

    rerender(
      <ThemeProvider theme={theme}>
        <I18nextProvider i18n={i18n}>
          <CustomerMapBackground carMarker={{ lat: 50.02, lng: 15.04 }} />
        </I18nextProvider>
      </ThemeProvider>,
    )

    // No animation frame was scheduled — the marker is already at the new target.
    expect(rafCallbacks).toHaveLength(0)
    const car = screen
      .getAllByTestId('leaflet-marker')
      .find((m) => m.getAttribute('data-icon-class') === 'tracking-car-icon')!
    expect(car).toHaveAttribute('data-position', JSON.stringify([50.02, 15.04]))
  })

  it('has no axe violations', async () => {
    mockConfig()
    mockMatchMedia(true)
    const { container } = renderBackground({
      onCenterChange: vi.fn(),
      carMarker: { lat: 49.948, lng: 15.268 },
      pickupMarker: { lat: 49.95, lng: 15.27 },
    })
    expect(await axe(container)).toHaveNoViolations()
  })
})

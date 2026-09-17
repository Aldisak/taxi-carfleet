import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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

import CustomerMapBackground from './CustomerMapBackground'
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

describe('CustomerMapBackground', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    setView.mockClear()
    fitBounds.mockClear()
    moveendHandler = null
    mapCenter = { lat: 50.03, lng: 15.2 }
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

  it('has no axe violations', async () => {
    mockConfig()
    const { container } = renderBackground({ onCenterChange: vi.fn() })
    expect(await axe(container)).toHaveNoViolations()
  })
})

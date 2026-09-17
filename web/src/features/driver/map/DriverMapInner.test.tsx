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
import type { LatLng } from '../../../shared/map/mapCamera'

// Captured react-leaflet controller hooks so the camera test can drive them imperatively.
const setView = vi.fn()
const fitBounds = vi.fn()

// Mock react-leaflet so jsdom never mounts a real Leaflet map. MapContainer renders children and
// carries role="application" + forwards its aria-label (CLAUDE.md UC-014 WI-2 aria-prohibited-attr
// trap). Marker/TileLayer/Polyline are stubs exposing their props via data-attrs.
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
  Polyline: ({ positions }: { positions: [number, number][] }) => (
    <div data-testid="route-polyline" data-positions={JSON.stringify(positions)} />
  ),
  useMap: () => ({
    setView,
    fitBounds,
    getZoom: () => 15,
  }),
}))

// leafletSetup runs an icon-fix side effect on import — stub it (MapyMap imports it).
vi.mock('../../../shared/map/leafletSetup', () => ({}))
vi.mock('../../../shared/map/useGeoConfig', () => ({ useGeoConfig: vi.fn() }))

import DriverMapInner from './DriverMapInner'
import { useGeoConfig } from '../../../shared/map/useGeoConfig'

const CONFIG: GeoConfigResponse = {
  tileUrlTemplate: 'https://api.mapy.cz/v1/maptiles/basic/256/{z}/{x}/{y}?apikey={apikey}',
  browserKey: 'browser-key-123',
  attributionHtml: '<a href="https://api.mapy.cz/copyright">Mapy.cz</a>',
  mapCenterLat: 50.03,
  mapCenterLng: 15.2,
  mapZoom: 11,
}

function mockConfig(): void {
  vi.mocked(useGeoConfig).mockReturnValue({
    data: CONFIG,
    isLoading: false,
    isError: false,
  } as UseQueryResult<GeoConfigResponse>)
}

const OWN: LatLng = { lat: 50.0, lng: 15.0 }
const PICKUP: LatLng = { lat: 49.95, lng: 15.27 }
const DROPOFF: LatLng = { lat: 49.9, lng: 15.2 }

function renderMap(props: Partial<React.ComponentProps<typeof DriverMapInner>> = {}) {
  return render(
    <ThemeProvider theme={theme}>
      <I18nextProvider i18n={i18n}>
        <DriverMapInner
          own={null}
          pickup={null}
          dropoff={null}
          routeGeometry={null}
          cameraTarget={null}
          {...props}
        />
      </I18nextProvider>
    </ThemeProvider>,
  )
}

describe('DriverMapInner', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    setView.mockClear()
    fitBounds.mockClear()
  })

  it('renders the map region with the default driver.map.label aria-label', () => {
    mockConfig()
    renderMap()
    expect(screen.getByTestId('map-container')).toHaveAttribute(
      'aria-label',
      i18n.t('driver.map.label'),
    )
  })

  it('draws a Polyline from the route geometry when it has >=2 points', () => {
    mockConfig()
    const geometry = [
      [50.0, 15.0],
      [49.97, 15.13],
      [49.95, 15.27],
    ]
    renderMap({ routeGeometry: geometry })
    const line = screen.getByTestId('route-polyline')
    expect(line).toHaveAttribute('data-positions', JSON.stringify(geometry))
  })

  it('draws no Polyline when the geometry is null', () => {
    mockConfig()
    renderMap({ routeGeometry: null })
    expect(screen.queryByTestId('route-polyline')).not.toBeInTheDocument()
  })

  it('draws no Polyline when the geometry has fewer than 2 points', () => {
    mockConfig()
    renderMap({ routeGeometry: [[50.0, 15.0]] })
    expect(screen.queryByTestId('route-polyline')).not.toBeInTheDocument()
  })

  it('renders own, pickup, and dropoff markers when all are present', () => {
    mockConfig()
    renderMap({ own: OWN, pickup: PICKUP, dropoff: DROPOFF })
    const classes = screen
      .getAllByTestId('leaflet-marker')
      .map((m) => m.getAttribute('data-icon-class'))
    expect(classes).toContain('ride-own-icon')
    expect(classes).toContain('ride-pickup-icon')
    expect(classes).toContain('ride-dropoff-icon')
  })

  it('renders only the own marker when pickup and dropoff are null', () => {
    mockConfig()
    renderMap({ own: OWN, pickup: null, dropoff: null })
    const markers = screen.getAllByTestId('leaflet-marker')
    expect(markers).toHaveLength(1)
    expect(markers[0]).toHaveAttribute('data-icon-class', 'ride-own-icon')
  })

  it('renders no dropoff marker when dropoff is null', () => {
    mockConfig()
    renderMap({ own: OWN, pickup: PICKUP, dropoff: null })
    const classes = screen
      .getAllByTestId('leaflet-marker')
      .map((m) => m.getAttribute('data-icon-class'))
    expect(classes).toContain('ride-pickup-icon')
    expect(classes).not.toContain('ride-dropoff-icon')
  })

  it('drives fitBounds when cameraTarget carries two points', () => {
    mockConfig()
    renderMap({ own: OWN, pickup: PICKUP, cameraTarget: [OWN, PICKUP] })
    expect(fitBounds).toHaveBeenCalledTimes(1)
    expect(setView).not.toHaveBeenCalled()
  })

  it('drives setView (clamped zoom) when cameraTarget carries a single point', () => {
    mockConfig()
    renderMap({ own: OWN, cameraTarget: [OWN] })
    expect(setView).toHaveBeenCalledTimes(1)
    expect(setView).toHaveBeenCalledWith([OWN.lat, OWN.lng], 15)
  })

  it('has no axe violations', async () => {
    mockConfig()
    const { container } = renderMap({
      own: OWN,
      pickup: PICKUP,
      dropoff: DROPOFF,
      routeGeometry: [
        [50.0, 15.0],
        [49.95, 15.27],
      ],
      cameraTarget: [OWN, PICKUP],
    })
    expect(await axe(container)).toHaveNoViolations()
  })
})

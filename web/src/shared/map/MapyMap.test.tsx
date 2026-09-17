import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import type { ReactNode } from 'react'
import i18n from '../i18n'
import { theme } from '../theme/theme'
import { axe } from '../test/axe'
import type { UseQueryResult } from '@tanstack/react-query'
import type { GeoConfigResponse } from '../api/client'

// Shared spy for the map instance so the InvalidateSizeController test can assert invalidateSize.
// vi.hoisted so the vi.mock factory (hoisted above imports) can reference it.
const leafletMocks = vi.hoisted(() => ({ invalidateSize: vi.fn() }))

// Mock react-leaflet pieces so jsdom never mounts a real Leaflet map. MapContainer renders its
// children (preserving the react-leaflet context contract); TileLayer exposes its url/attribution
// + tile robustness props as data attributes so the test can assert them; useMap returns a stub
// map so the InvalidateSizeController (rendered inside MapContainer) works headlessly.
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children, center, zoom, ...rest }: { children?: ReactNode; center?: [number, number]; zoom?: number } & Record<string, unknown>) => (
    <div
      data-testid="map-container"
      data-center={JSON.stringify(center)}
      data-zoom={String(zoom)}
      aria-label={rest['aria-label'] as string | undefined}
    >
      {children}
    </div>
  ),
  TileLayer: ({ url, attribution, keepBuffer, updateWhenIdle, eventHandlers }: { url: string; attribution?: string; keepBuffer?: number; updateWhenIdle?: boolean; eventHandlers?: { tileerror?: () => void } }) => (
    <div
      data-testid="tile-layer"
      data-url={url}
      data-attribution={attribution}
      data-keep-buffer={String(keepBuffer)}
      data-update-when-idle={String(updateWhenIdle)}
      ref={(el) => {
        // Bridge the react-leaflet eventHandlers.tileerror to a DOM event the test can dispatch.
        if (el && eventHandlers?.tileerror) {
          el.addEventListener('tileerror', () => eventHandlers.tileerror?.())
        }
      }}
    />
  ),
  useMap: () => ({
    invalidateSize: leafletMocks.invalidateSize,
    getContainer: () => document.createElement('div'),
  }),
}))

// Leaflet setup runs an icon-fix side effect on import — stub it so no real leaflet is needed.
vi.mock('./leafletSetup', () => ({}))

vi.mock('./useGeoConfig', () => ({ useGeoConfig: vi.fn() }))

import { MapyMap } from './MapyMap'
import { useGeoConfig } from './useGeoConfig'

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

function renderMap(props: React.ComponentProps<typeof MapyMap> = {}) {
  return render(
    <ThemeProvider theme={theme}>
      <I18nextProvider i18n={i18n}>
        <MapyMap {...props}>
          <div data-testid="child-layer" />
        </MapyMap>
      </I18nextProvider>
    </ThemeProvider>,
  )
}

describe('MapyMap', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders a TileLayer with the config-derived Mapy tile URL (key injected)', () => {
    mockConfig()
    renderMap()
    const tile = screen.getByTestId('tile-layer')
    expect(tile.getAttribute('data-url')).toContain('apikey=browser-key-123')
    expect(tile.getAttribute('data-url')).not.toContain('{apikey}')
    expect(tile.getAttribute('data-url')).toContain('{z}/{x}/{y}')
  })

  it('sets tile robustness options (keepBuffer, updateWhenIdle) to reduce white tiles on pan', () => {
    mockConfig()
    renderMap()
    const tile = screen.getByTestId('tile-layer')
    // keepBuffer raised above Leaflet's default 2 so panning reveals cached tiles, not white gaps.
    expect(tile.getAttribute('data-keep-buffer')).toBe('4')
    // updateWhenIdle=false so tiles load during pan on mobile too (default is true on touch).
    expect(tile.getAttribute('data-update-when-idle')).toBe('false')
  })

  it('invalidates the map size after mount so tiles re-measure against the settled container', async () => {
    mockConfig()
    leafletMocks.invalidateSize.mockClear()
    renderMap()
    // The InvalidateSizeController schedules invalidateSize on the next animation frame — this is
    // what recovers from the container settling its size after mount (Suspense reveal / flex layout).
    await waitFor(() => expect(leafletMocks.invalidateSize).toHaveBeenCalled())
    expect(leafletMocks.invalidateSize).toHaveBeenCalledWith({ pan: false })
  })

  it('passes the mandatory Mapy attribution to the TileLayer', () => {
    mockConfig()
    renderMap()
    expect(screen.getByTestId('tile-layer').getAttribute('data-attribution')).toBe(CONFIG.attributionHtml)
  })

  it('renders an accessible Mapy logo link to mapy.com with a source title', () => {
    mockConfig()
    renderMap()
    const link = screen.getByRole('link', { name: /mapy\.com/i })
    expect(link).toHaveAttribute('href', expect.stringContaining('mapy.com'))
    // The i18n attribution label is wired as the link title (map-data source affordance).
    expect(link).toHaveAttribute('title', i18n.t('map.attributionLabel'))
  })

  it('renders children inside the map container (react-leaflet context preserved)', () => {
    mockConfig()
    renderMap()
    const container = screen.getByTestId('map-container')
    expect(container).toContainElement(screen.getByTestId('child-layer'))
  })

  it('defaults center and zoom from config when the caller omits them', () => {
    mockConfig()
    renderMap()
    const container = screen.getByTestId('map-container')
    expect(container.getAttribute('data-center')).toBe(JSON.stringify([50.03, 15.2]))
    expect(container.getAttribute('data-zoom')).toBe('11')
  })

  it('uses the caller-supplied center/zoom over the config default', () => {
    mockConfig()
    renderMap({ center: [49.5, 14.0], zoom: 15 })
    const container = screen.getByTestId('map-container')
    expect(container.getAttribute('data-center')).toBe(JSON.stringify([49.5, 14.0]))
    expect(container.getAttribute('data-zoom')).toBe('15')
  })

  it('shows a loading state and does NOT mount the map before config resolves', () => {
    mockConfig({ data: undefined, isLoading: true })
    renderMap()
    expect(screen.queryByTestId('map-container')).not.toBeInTheDocument()
    expect(screen.getByText(/načítám mapu/i)).toBeInTheDocument()
  })

  it('degrades on config error: shows the unavailable banner + still mounts the map (grey, no tiles) with markers by coordinate (AC#5)', () => {
    // A caller center is present (a real map screen always passes one) — markers place by it.
    mockConfig({ data: undefined, isLoading: false, isError: true })
    renderMap({ center: [50.08, 14.42], zoom: 12 })
    // The map container IS mounted so children/markers still render by coordinate.
    const container = screen.getByTestId('map-container')
    expect(container).toContainElement(screen.getByTestId('child-layer'))
    // No tile layer (config/tiles unavailable → grey background).
    expect(screen.queryByTestId('tile-layer')).not.toBeInTheDocument()
    // The degradation banner is announced.
    expect(screen.getByRole('alert')).toHaveTextContent(/mapa dočasně nedostupná/i)
  })

  it('falls back to a default center when config errors and the caller omits a center', () => {
    mockConfig({ data: undefined, isLoading: false, isError: true })
    renderMap()
    // Still mounts (never a blank screen) using the hardcoded Prague fallback center.
    expect(screen.getByTestId('map-container')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('shows the unavailable banner when the TileLayer reports a tile load error (config present)', async () => {
    mockConfig()
    renderMap()
    // Config is present so tiles render initially — no banner yet.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    // Simulate a tile fetch failure via the TileLayer's onError hook (wired by MapyMap).
    const tile = screen.getByTestId('tile-layer')
    act(() => {
      tile.dispatchEvent(new Event('tileerror'))
    })
    expect(await screen.findByRole('alert')).toHaveTextContent(/mapa dočasně nedostupná/i)
  })

  it('has no axe violations', async () => {
    mockConfig()
    const { container } = renderMap()
    expect(await axe(container)).toHaveNoViolations()
  })
})

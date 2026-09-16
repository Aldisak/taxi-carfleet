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
  useMap: () => ({ setView: vi.fn(), fitBounds: vi.fn(), getZoom: () => 12 }),
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

function renderBackground() {
  return render(
    <ThemeProvider theme={theme}>
      <I18nextProvider i18n={i18n}>
        <CustomerMapBackground />
      </I18nextProvider>
    </ThemeProvider>,
  )
}

describe('CustomerMapBackground', () => {
  afterEach(() => {
    vi.restoreAllMocks()
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

  it('has no axe violations', async () => {
    mockConfig()
    const { container } = renderBackground()
    expect(await axe(container)).toHaveNoViolations()
  })
})

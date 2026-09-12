import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../../../../shared/i18n'
import { theme } from '../../../../shared/theme/theme'
import { axe } from '../../../../shared/test/axe'
import type { ZoneDto } from '../../../../shared/api/client'
import type { ZoneEditorMapProps } from './ZoneEditorMap'

// Leaflet body is stubbed so jsdom never loads react-leaflet. The stub exposes buttons that
// invoke the draw callbacks, so the create flow is driven without a real map.
vi.mock('./ZoneEditorMap', () => ({
  default: ({ zones, onCircleDrawn, onPolygonDrawn }: ZoneEditorMapProps) => (
    <div data-testid="fake-zone-map">
      <span>{`zones:${zones.length}`}</span>
      <button type="button" onClick={() => onCircleDrawn({ center: { lat: 49.948, lng: 15.268 }, radiusMeters: 800 })}>
        fake-draw-circle
      </button>
      <button
        type="button"
        onClick={() => onPolygonDrawn([{ lat: 49.95, lng: 15.26 }, { lat: 49.96, lng: 15.27 }, { lat: 49.94, lng: 15.28 }])}
      >
        fake-draw-polygon
      </button>
    </div>
  ),
}))

vi.mock('../../../../shared/api/client', () => ({
  getZones: vi.fn(),
  createZone: vi.fn(),
  updateZone: vi.fn(),
  deleteZone: vi.fn(),
}))

import { getZones, createZone, deleteZone } from '../../../../shared/api/client'
import { ZonesTab } from './ZonesTab'

const mockGetZones = vi.mocked(getZones)
const mockCreateZone = vi.mocked(createZone)
const mockDeleteZone = vi.mocked(deleteZone)

const seedZones: ZoneDto[] = [
  { id: 'z1', name: 'Centrum KH', shape: 'Circle', centerLat: 49.948, centerLng: 15.268, radiusMeters: 800, polygon: null, isEnabled: true },
  { id: 'z2', name: 'Pěší zóna', shape: 'Polygon', centerLat: null, centerLng: null, radiusMeters: null, polygon: [[49.95, 15.26], [49.96, 15.27], [49.94, 15.28]], isEnabled: false },
]

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={theme}>
        <I18nextProvider i18n={i18n}>
          <ZonesTab />
        </I18nextProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  )
}

describe('ZonesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetZones.mockResolvedValue(seedZones)
  })

  it('lists the fleet zones with their shape metadata', async () => {
    renderTab()
    expect(await screen.findByText('Centrum KH')).toBeInTheDocument()
    expect(screen.getByText('Pěší zóna')).toBeInTheDocument()
    // The circle shows its radius; the polygon its point count.
    expect(screen.getByText(/poloměr 800 m/i)).toBeInTheDocument()
    expect(screen.getByText(/3 bodů/i)).toBeInTheDocument()
  })

  it('requires a name before a drawn circle is saved', async () => {
    const user = userEvent.setup()
    renderTab()
    await screen.findByText('Centrum KH')
    await user.click(screen.getByRole('button', { name: /fake-draw-circle/i }))
    expect(mockCreateZone).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent(/zadejte název/i)
  })

  it('creates a Circle zone from a draw with the haversine radius from the map', async () => {
    const user = userEvent.setup()
    mockCreateZone.mockResolvedValue(seedZones[0]!)
    renderTab()
    await screen.findByText('Centrum KH')

    await user.type(screen.getByLabelText(/název zóny/i), 'Nová zóna')
    await user.click(screen.getByRole('button', { name: /fake-draw-circle/i }))

    await waitFor(() => expect(mockCreateZone).toHaveBeenCalledTimes(1))
    const req = mockCreateZone.mock.calls[0]![0]
    expect(req.shape).toBe('Circle')
    expect(req.name).toBe('Nová zóna')
    expect(req.centerLat).toBe(49.948)
    expect(req.radiusMeters).toBe(800)
    expect(req.polygon).toBeNull()
    expect(req.isEnabled).toBe(true)
  })

  it('creates a Polygon zone from a closed ring', async () => {
    const user = userEvent.setup()
    mockCreateZone.mockResolvedValue(seedZones[1]!)
    renderTab()
    await screen.findByText('Centrum KH')

    await user.type(screen.getByLabelText(/název zóny/i), 'Polygonová zóna')
    await user.click(screen.getByRole('button', { name: /fake-draw-polygon/i }))

    await waitFor(() => expect(mockCreateZone).toHaveBeenCalledTimes(1))
    const req = mockCreateZone.mock.calls[0]![0]
    expect(req.shape).toBe('Polygon')
    expect(req.polygon).toEqual([[49.95, 15.26], [49.96, 15.27], [49.94, 15.28]])
    expect(req.radiusMeters).toBeNull()
  })

  it('deletes a zone', async () => {
    const user = userEvent.setup()
    mockDeleteZone.mockResolvedValue(undefined)
    renderTab()
    await screen.findByText('Centrum KH')

    await user.click(screen.getByRole('button', { name: /smazat zónu centrum kh/i }))
    await waitFor(() => expect(mockDeleteZone).toHaveBeenCalledWith('z1'))
  })

  it('has no axe violations', async () => {
    const { container } = renderTab()
    await screen.findByText('Centrum KH')
    expect(await axe(container)).toHaveNoViolations()
  })
})

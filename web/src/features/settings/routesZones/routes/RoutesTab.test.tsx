import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../../../../shared/i18n'
import { theme } from '../../../../shared/theme/theme'
import { axe } from '../../../../shared/test/axe'
import type { RouteAdminDto, ZoneDto } from '../../../../shared/api/client'

// Stub the lazy Leaflet pin pickers so jsdom never loads react-leaflet.
vi.mock('../PinPickerMap', () => ({
  default: () => <div data-testid="fake-pin-map" />,
}))

vi.mock('../../../../shared/api/client', () => ({
  getRoutes: vi.fn(),
  createRoute: vi.fn(),
  updateRoute: vi.fn(),
  deleteRoute: vi.fn(),
  setRouteEnabled: vi.fn(),
  setRoutePriority: vi.fn(),
  getZones: vi.fn(),
  getPriceQuote: vi.fn(),
}))

import {
  getRoutes,
  createRoute,
  deleteRoute,
  setRouteEnabled,
  setRoutePriority,
  getZones,
  getPriceQuote,
} from '../../../../shared/api/client'
import { RoutesTab } from './RoutesTab'

const mockGetRoutes = vi.mocked(getRoutes)
const mockCreateRoute = vi.mocked(createRoute)
const mockDeleteRoute = vi.mocked(deleteRoute)
const mockSetEnabled = vi.mocked(setRouteEnabled)
const mockSetPriority = vi.mocked(setRoutePriority)
const mockGetZones = vi.mocked(getZones)
const mockGetPriceQuote = vi.mocked(getPriceQuote)

function route(partial: Partial<RouteAdminDto>): RouteAdminDto {
  return {
    id: 'r1', name: 'Trasa', type: 'Zone', priceCzk: 110,
    fromZoneId: 'zA', toZoneId: null, fromLat: 49.9, fromLng: 15.2, toLat: null, toLng: null,
    fromRadiusMeters: 150, toRadiusMeters: 150, isBidirectional: true,
    validDays: 127, validFromTime: null, validToTime: null, priority: 0, isEnabled: true,
    ...partial,
  }
}

const seedRoutes: RouteAdminDto[] = [
  route({ id: 'r1', name: 'KH → Kolín', type: 'ZoneToZone', priceCzk: 300, priority: 2 }),
  route({ id: 'r2', name: 'Noční v KH', type: 'Zone', priceCzk: 200, priority: 1, validFromTime: '03:00:00', validToTime: '04:00:00', isEnabled: false }),
  route({ id: 'r3', name: 'Nádraží → Centrum', type: 'PointToPoint', priceCzk: 100, priority: 0, toLat: 49.95, toLng: 15.26 }),
]

const seedZones: ZoneDto[] = [
  { id: 'zA', name: 'Centrum KH', shape: 'Circle', centerLat: 49.948, centerLng: 15.268, radiusMeters: 800, polygon: null, isEnabled: true },
  { id: 'zB', name: 'Kolín', shape: 'Circle', centerLat: 50.02, centerLng: 15.2, radiusMeters: 1000, polygon: null, isEnabled: true },
]

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={theme}>
        <I18nextProvider i18n={i18n}>
          <RoutesTab />
        </I18nextProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  )
}

describe('RoutesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetRoutes.mockResolvedValue(seedRoutes)
    mockGetZones.mockResolvedValue(seedZones)
    mockGetPriceQuote.mockResolvedValue({ type: 'Meter', baseCzk: 40, perKmCzk: 30, minimumCzk: 60 })
  })

  it('lists routes with a type badge, price and validity summary', async () => {
    renderTab()
    expect(await screen.findByText('KH → Kolín')).toBeInTheDocument()
    // all-week all-day routes show the full summary (r1 + r3)
    expect(screen.getAllByText(/Po–Ne, celý den/).length).toBeGreaterThan(0)
    // the night route shows its bounded window
    expect(screen.getByText(/03:00–04:00/)).toBeInTheDocument()
    // price formatting (cs-CZ integer CZK)
    expect(screen.getByText(/300 Kč/)).toBeInTheDocument()
  })

  it('toggles a route enable via PATCH enable', async () => {
    const user = userEvent.setup()
    mockSetEnabled.mockResolvedValue(undefined)
    renderTab()
    await screen.findByText('KH → Kolín')

    await user.click(screen.getByRole('checkbox', { name: /zapnout nebo vypnout trasu kh → kolín/i }))
    // The client fn takes (id, isEnabled); the hook's mutationFn passes them positionally.
    await waitFor(() => expect(mockSetEnabled).toHaveBeenCalledWith('r1', false))
  })

  it('reorders via move-down and persists the minimal priority PATCH set', async () => {
    const user = userEvent.setup()
    mockSetPriority.mockResolvedValue(undefined)
    renderTab()
    await screen.findByText('KH → Kolín')

    // Move the top route (r1, priority 2) down one slot → r2 to top. New order r2,r1,r3.
    // Descending target priorities are 2,1,0 → r2 must become 2 (was 1), r1 must become 1 (was 2).
    await user.click(screen.getByRole('button', { name: /posunout trasu kh → kolín dolů/i }))

    await waitFor(() => expect(mockSetPriority).toHaveBeenCalled())
    // The client fn takes (id, priority); assert the (id, priority) tuples.
    const calls = mockSetPriority.mock.calls
    expect(calls).toContainEqual(['r2', 2])
    expect(calls).toContainEqual(['r1', 1])
  })

  it('creates a Zone route through the type-aware editor', async () => {
    const user = userEvent.setup()
    mockCreateRoute.mockResolvedValue({ id: 'new' })
    renderTab()
    await screen.findByText('KH → Kolín')

    await user.click(screen.getByRole('button', { name: /přidat trasu/i }))
    await user.type(screen.getByLabelText(/název trasy/i), 'Nová zóna')
    await user.selectOptions(screen.getByLabelText(/typ trasy/i), 'Zone')
    // price
    const price = screen.getByLabelText(/cena \(kč\)/i)
    await user.clear(price)
    await user.type(price, '130')
    await user.selectOptions(screen.getByLabelText(/výchozí zóna/i), 'zA')
    await user.click(screen.getByRole('button', { name: /uložit/i }))

    await waitFor(() => expect(mockCreateRoute).toHaveBeenCalledTimes(1))
    const req = mockCreateRoute.mock.calls[0]![0]
    expect(req.type).toBe('Zone')
    expect(req.fromZoneId).toBe('zA')
    expect(req.priceCzk).toBe(130)
    expect(req.toZoneId).toBeNull()
  })

  it('deletes a route', async () => {
    const user = userEvent.setup()
    mockDeleteRoute.mockResolvedValue(undefined)
    renderTab()
    await screen.findByText('KH → Kolín')

    await user.click(screen.getByRole('button', { name: /smazat trasu kh → kolín/i }))
    await waitFor(() => expect(mockDeleteRoute).toHaveBeenCalledWith('r1'))
  })

  it('has no axe violations', async () => {
    const { container } = renderTab()
    await screen.findByText('KH → Kolín')
    expect(await axe(container)).toHaveNoViolations()
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../../shared/i18n'
import { theme } from '../../../shared/theme/theme'
import { axe } from '../../../shared/test/axe'
import type { OrderDetailDto } from '../../../shared/api/client'

// ── navigate spy (react-router) ──────────────────────────────────────────────
const navigateMock = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigateMock }
})

// ── the lazy leaflet body is mocked — never mount a real MapContainer (laneB3c) ──
const driverMapInnerProps = vi.fn()
vi.mock('./DriverMapInner', () => ({
  default: (props: Record<string, unknown>) => {
    driverMapInnerProps(props)
    return <div data-testid="driver-map-inner" />
  },
}))

// ── driver profile / status ──────────────────────────────────────────────────
let meData: { driverId: string; status: string; currentVehicleId?: string; currentVehiclePlate?: string } | undefined
vi.mock('../home/useDriverMe', () => ({
  useDriverMe: () => ({ data: meData }),
}))

// ── go online / offline ──────────────────────────────────────────────────────
const goOnlineMock = vi.fn()
const goOfflineMock = vi.fn()
vi.mock('../home/useGoOnline', () => ({
  useGoOnline: () => ({ isPending: false, error: null, goOnline: goOnlineMock }),
}))
vi.mock('../home/useGoOffline', () => ({
  useGoOffline: () => ({ isPending: false, error: null, goOffline: goOfflineMock }),
}))

// ── own live position (atomic zustand selector) ──────────────────────────────
let ownPosition: { lat: number; lng: number } | null = { lat: 50.0, lng: 15.0 }
vi.mock('../position/useOwnPositionStore', () => ({
  useOwnPositionStore: (selector: (s: { position: unknown }) => unknown) =>
    selector({ position: ownPosition }),
}))

// ── active order (order + no-show timer) ─────────────────────────────────────
let activeOrder: OrderDetailDto | null = null
let noShowState = { noShowEnabled: false, noShowCountdownSeconds: null as number | null }
vi.mock('../ride/useActiveOrder', () => ({
  useActiveOrder: () => ({
    order: activeOrder,
    arrivedAt: null,
    noShowEnabled: noShowState.noShowEnabled,
    noShowCountdownSeconds: noShowState.noShowCountdownSeconds,
  }),
}))

// ── ride transition ──────────────────────────────────────────────────────────
type Outcome = { type: 'success' | 'stale' | 'queued' | 'noop' }
const arriveMock = vi.fn<(id: string) => Promise<Outcome>>(async () => ({ type: 'success' }))
const startMock = vi.fn<(id: string) => Promise<Outcome>>(async () => ({ type: 'success' }))
const cancelNoShowMock = vi.fn<(id: string) => Promise<Outcome>>(async () => ({ type: 'success' }))
vi.mock('../ride/useRideTransition', () => ({
  useRideTransition: () => ({
    isPending: false,
    arrive: arriveMock,
    start: startMock,
    cancelNoShow: cancelNoShowMock,
  }),
}))

// ── re-homed session hooks (F-2 pins) ────────────────────────────────────────
const useRideRestoreMock = vi.fn()
const useLiveClearMock = vi.fn()
const useWakeLockMock = vi.fn()
vi.mock('../ride/useRideRestore', () => ({ useRideRestore: (id?: string) => useRideRestoreMock(id) }))
vi.mock('../ride/useLiveClear', () => ({ useLiveClear: (id?: string) => useLiveClearMock(id) }))
vi.mock('../position/useWakeLock', () => ({ useWakeLock: (on: boolean) => useWakeLockMock(on) }))

// ── other session mounts (no-op) ─────────────────────────────────────────────
vi.mock('../queue/useTransitionQueue', () => ({ useQueuePendingCount: () => 0 }))
vi.mock('../home/useOwnStatusSync', () => ({ useOwnStatusSync: vi.fn() }))
const ensureSubscribedMock = vi.fn(async () => {})
vi.mock('../../../shared/push/usePushSubscription', () => ({
  usePushSubscription: () => ({ ensureSubscribed: ensureSubscribedMock }),
}))

// ── route geometry (eager, no leaflet) ───────────────────────────────────────
let routeGeometryResult = {
  geometry: [[50, 15], [49.95, 15.27]] as number[][] | null,
  durationSeconds: 420 as number | null,
  isLoading: false,
}
vi.mock('./useRouteGeometry', () => ({
  useRouteGeometry: () => routeGeometryResult,
}))

import { DriverMapScreen } from './DriverMapScreen'

const RIDE_ORDER: OrderDetailDto = {
  id: 'o1',
  publicCode: 'ABC123',
  status: 'InProgress',
  source: 'Phone',
  customerPhone: '+420777123456',
  customerName: 'Jan Novák',
  pickupAddress: 'Nádražní 1, Kutná Hora',
  pickupLat: 49.95,
  pickupLng: 15.27,
  dropoffAddress: 'Centrum Kutná Hora',
  dropoffLat: 49.96,
  dropoffLng: 15.28,
  scheduledAt: null,
  note: null,
  passengers: 1,
  priceType: 'Estimated',
  estimatedPriceCzk: 150,
  fixedPriceCzk: null,
  finalPriceCzk: null,
  paymentType: 'Cash',
  driverId: 'd1',
  vehicleId: 'v1',
  createdAt: '2026-09-17T10:00:00Z',
  updatedAt: '2026-09-17T10:00:00Z',
  allowedActions: [],
  version: 1,
}

function renderScreen() {
  return render(
    <MemoryRouter>
      <ThemeProvider theme={theme}>
        <I18nextProvider i18n={i18n}>
          <DriverMapScreen />
        </I18nextProvider>
      </ThemeProvider>
    </MemoryRouter>,
  )
}

describe('DriverMapScreen', () => {
  beforeEach(() => {
    navigateMock.mockClear()
    goOnlineMock.mockClear()
    goOfflineMock.mockClear()
    arriveMock.mockClear()
    startMock.mockClear()
    cancelNoShowMock.mockClear()
    useRideRestoreMock.mockClear()
    useLiveClearMock.mockClear()
    useWakeLockMock.mockClear()
    ensureSubscribedMock.mockClear()
    driverMapInnerProps.mockClear()
    ownPosition = { lat: 50.0, lng: 15.0 }
    activeOrder = null
    noShowState = { noShowEnabled: false, noShowCountdownSeconds: null }
    routeGeometryResult = {
      geometry: [[50, 15], [49.95, 15.27]],
      durationSeconds: 420,
      isLoading: false,
    }
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('Offline: shows the vehicle selector + start-shift button', () => {
    meData = { driverId: 'd1', status: 'Offline', currentVehicleId: 'v1', currentVehiclePlate: '1AB' }
    renderScreen()
    expect(screen.getByLabelText(i18n.t('driver.home.vehicle.label'))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: i18n.t('driver.home.status.startShift') })).toBeInTheDocument()
  })

  it('Offline: clicking start-shift with a selected vehicle calls goOnline', async () => {
    const user = userEvent.setup()
    meData = { driverId: 'd1', status: 'Offline', currentVehicleId: 'v1', currentVehiclePlate: '1AB' }
    renderScreen()
    await user.click(screen.getByRole('button', { name: i18n.t('driver.home.status.startShift') }))
    expect(goOnlineMock).toHaveBeenCalledWith('v1')
  })

  it('Free: shows the waiting indicator (role=status) + end-shift button', async () => {
    const user = userEvent.setup()
    meData = { driverId: 'd1', status: 'Free' }
    renderScreen()
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent(i18n.t('driver.home.status.waitingForOrder'))
    await user.click(screen.getByRole('button', { name: i18n.t('driver.home.status.endShift') }))
    expect(goOfflineMock).toHaveBeenCalled()
  })

  it('active ride: renders the ride sheet with controls and feeds the map own/pickup/route props', async () => {
    meData = { driverId: 'd1', status: 'EnRoute' }
    activeOrder = RIDE_ORDER
    renderScreen()
    // Complete button lives in the RideSheet (InProgress → 'Ukončit jízdu')
    expect(await screen.findByRole('button', { name: i18n.t('driver.ride.complete') })).toBeInTheDocument()
    // The lazy DriverMapInner (mocked) received the ride coordinates + geometry.
    const mapProps = driverMapInnerProps.mock.calls.at(-1)![0]
    expect(mapProps.own).toEqual({ lat: 50.0, lng: 15.0 })
    expect(mapProps.pickup).toEqual({ lat: 49.95, lng: 15.27 })
    expect(mapProps.routeGeometry).toEqual([[50, 15], [49.95, 15.27]])
  })

  it('complete action navigates to /driver/ride/complete', async () => {
    const user = userEvent.setup()
    meData = { driverId: 'd1', status: 'EnRoute' }
    activeOrder = RIDE_ORDER
    renderScreen()
    await user.click(await screen.findByRole('button', { name: i18n.t('driver.ride.complete') }))
    expect(navigateMock).toHaveBeenCalledWith('/driver/ride/complete')
  })

  it('definitive-conflict transition shows the reassigned banner', async () => {
    const user = userEvent.setup()
    arriveMock.mockResolvedValueOnce({ type: 'stale' })
    meData = { driverId: 'd1', status: 'EnRoute' }
    activeOrder = { ...RIDE_ORDER, status: 'Accepted' }
    renderScreen()
    await user.click(await screen.findByRole('button', { name: i18n.t('driver.ride.arrive') }))
    expect(await screen.findByRole('alert')).toHaveTextContent(i18n.t('driver.ride.reassigned'))
  })

  it('F-2: re-homes the session hooks — useRideRestore/useLiveClear(myDriverId) + useWakeLock(order != null)', () => {
    meData = { driverId: 'd1', status: 'EnRoute' }
    activeOrder = RIDE_ORDER
    renderScreen()
    expect(useRideRestoreMock).toHaveBeenCalledWith('d1')
    expect(useLiveClearMock).toHaveBeenCalledWith('d1')
    expect(useWakeLockMock).toHaveBeenCalledWith(true)
  })

  it('F-2: useWakeLock(false) when there is no active order', () => {
    meData = { driverId: 'd1', status: 'Free' }
    activeOrder = null
    renderScreen()
    expect(useWakeLockMock).toHaveBeenCalledWith(false)
  })

  it('registers the push subscription on mount', () => {
    meData = { driverId: 'd1', status: 'Free' }
    renderScreen()
    expect(ensureSubscribedMock).toHaveBeenCalled()
  })

  it('atomic own-position selector: renders without an infinite loop / console error', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    meData = { driverId: 'd1', status: 'Free' }
    renderScreen()
    expect(errorSpy).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('axe: Offline state has no violations', async () => {
    meData = { driverId: 'd1', status: 'Offline', currentVehicleId: 'v1', currentVehiclePlate: '1AB' }
    const { container } = renderScreen()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('axe: Free state has no violations', async () => {
    meData = { driverId: 'd1', status: 'Free' }
    const { container } = renderScreen()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('axe: active-ride state has no violations', async () => {
    meData = { driverId: 'd1', status: 'EnRoute' }
    activeOrder = RIDE_ORDER
    const { container } = renderScreen()
    await screen.findByRole('button', { name: i18n.t('driver.ride.complete') })
    expect(await axe(container)).toHaveNoViolations()
  })
})

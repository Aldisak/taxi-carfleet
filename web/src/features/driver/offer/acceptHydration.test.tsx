import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../../shared/i18n'
import { theme } from '../../../shared/theme/theme'
import type { OrderDetailDto } from '../../../shared/api/client'

/**
 * Accept → active-ride hydration contract (UC-019 WI-5 defect).
 *
 * This is the test the WI-5 unit suite lacked: it does NOT pre-mock useActiveOrder
 * to already return an order. It composes the SESSION-WIDE <OfferCard> (where Accept
 * happens) and the state-driven <DriverMapScreen> as siblings that share the module-
 * global useActiveOrderStore, STARTING FROM AN EMPTY STORE. Tapping Accept must
 * hydrate the store (via reconcileActiveRide → setOrder) so the ride view (RideSheet
 * "Jsem na místě") appears on /driver with NO route change. A regression goes RED here
 * without needing the e2e.
 */

// ── the offer accept client call (POST /orders/{id}/accept) ──────────────────
const acceptFn = vi.fn<(id: string) => Promise<{ type: string }>>()
vi.mock('./useOfferAccept', () => ({
  useOfferAccept: () => ({ isPending: false, accept: acceptFn }),
}))

// The offer card's sound + route/ETA + countdown are noise here — no-op them.
vi.mock('./useOfferSound', () => ({ useOfferSound: vi.fn() }))
vi.mock('./useOfferRoute', () => ({
  useOfferRoute: () => ({ distanceMeters: null, durationSeconds: null, isLoading: false }),
}))
vi.mock('./CountdownRing', () => ({ CountdownRing: () => <span>30</span> }))

// ── the server-authoritative reconcile (AC#6): GET /drivers/me → getOrder ─────
// This is what the accept-success path must invoke to hydrate the store. In the
// green build it returns the freshly-accepted order; the accept-hydration seam
// pipes r.order into useActiveOrderStore.setOrder.
const reconcileMock = vi.fn()
vi.mock('../ride/useRideRestore', async () => {
  const actual = await vi.importActual<typeof import('../ride/useRideRestore')>('../ride/useRideRestore')
  return {
    ...actual,
    reconcileActiveRide: (id: string) => reconcileMock(id),
    // DriverMapScreen mounts useRideRestore(myDriverId) on mount — no-op it so the
    // ONLY hydration under test is the accept path (not a mount-time restore).
    useRideRestore: vi.fn(),
  }
})

// ── DriverMapScreen heavy deps (leaflet, geometry, push, position, other hooks)
const driverMapInnerProps = vi.fn()
vi.mock('../map/DriverMapInner', () => ({
  default: (props: Record<string, unknown>) => {
    driverMapInnerProps(props)
    return <div data-testid="driver-map-inner" />
  },
}))
vi.mock('../map/useRouteGeometry', () => ({
  useRouteGeometry: () => ({ geometry: null, durationSeconds: null, isLoading: false }),
}))
vi.mock('../home/useDriverMe', () => ({
  useDriverMe: () => ({ data: { driverId: 'd1', status: 'Free' } }),
}))
vi.mock('../home/useGoOnline', () => ({
  useGoOnline: () => ({ isPending: false, error: null, goOnline: vi.fn() }),
}))
vi.mock('../home/useGoOffline', () => ({
  useGoOffline: () => ({ isPending: false, error: null, goOffline: vi.fn() }),
}))
vi.mock('../home/useOwnStatusSync', () => ({ useOwnStatusSync: vi.fn() }))
vi.mock('../position/useOwnPositionStore', () => ({
  useOwnPositionStore: (selector: (s: { position: unknown }) => unknown) =>
    selector({ position: { lat: 50.0, lng: 15.0 } }),
}))
vi.mock('../position/useWakeLock', () => ({ useWakeLock: vi.fn() }))
vi.mock('../ride/useLiveClear', () => ({ useLiveClear: vi.fn() }))
vi.mock('../ride/useRideTransition', () => ({
  useRideTransition: () => ({
    isPending: false,
    arrive: vi.fn(async () => ({ type: 'success' })),
    start: vi.fn(async () => ({ type: 'success' })),
    cancelNoShow: vi.fn(async () => ({ type: 'success' })),
  }),
}))
vi.mock('../queue/useTransitionQueue', () => ({ useQueuePendingCount: () => 0 }))
vi.mock('../../../shared/push/usePushSubscription', () => ({
  usePushSubscription: () => ({ ensureSubscribed: vi.fn(async () => {}) }),
}))

// REAL: useActiveOrder + useActiveOrderStore (the whole point — no store pre-mock).
import { OfferCard } from './OfferCard'
import { DriverMapScreen } from '../map/DriverMapScreen'
import { useActiveOrderStore } from '../ride/useActiveOrderStore'

const ACCEPTED_ORDER: OrderDetailDto = {
  id: 'o1',
  publicCode: 'ABC123',
  status: 'Accepted',
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

function renderComposed() {
  const onDismiss = vi.fn()
  const expiresAt = new Date(Date.now() + 30_000).toISOString()
  return render(
    <MemoryRouter>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider theme={theme}>
          <OfferCard dto={ACCEPTED_ORDER} expiresAt={expiresAt} onDismiss={onDismiss} />
          <DriverMapScreen />
        </ThemeProvider>
      </I18nextProvider>
    </MemoryRouter>,
  )
}

describe('OfferCard accept → DriverMapScreen ride-view hydration (UC-019 WI-5)', () => {
  beforeEach(() => {
    acceptFn.mockReset().mockResolvedValue({ type: 'success' })
    reconcileMock.mockReset().mockResolvedValue({ outcome: 'active', order: ACCEPTED_ORDER })
    driverMapInnerProps.mockClear()
    // Reset the shared module-global store to empty (as a fresh session would be).
    useActiveOrderStore.getState().clear()
  })

  afterEach(() => {
    vi.useRealTimers()
    useActiveOrderStore.getState().clear()
  })

  it('starts with an empty store: DriverMapScreen shows the Free panel, not the ride view', () => {
    renderComposed()
    // Sanity: nothing pre-hydrated the store — the ride "Jsem na místě" must be absent.
    expect(screen.queryByRole('button', { name: i18n.t('driver.ride.arrive') })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(i18n.t('driver.home.status.waitingForOrder'))
  })

  it('after tapping Accept, hydrates the store from the server so the ride view (Jsem na místě) renders on /driver', async () => {
    const user = userEvent.setup()
    renderComposed()

    await user.click(screen.getByRole('button', { name: i18n.t('driver.offer.accept') }))

    // The accept POST fired, then the server-authoritative reconcile ran.
    expect(acceptFn).toHaveBeenCalledWith('o1')
    // The ride view now paints (RideSheet "Jsem na místě") — no route change needed.
    expect(
      await screen.findByRole('button', { name: i18n.t('driver.ride.arrive') }),
    ).toBeInTheDocument()
    // And the store holds the reconciled order (single source of truth).
    expect(useActiveOrderStore.getState().order?.id).toBe('o1')
  })

  it('does NOT hydrate on a non-active reconcile outcome (offer already gone / terminal)', async () => {
    const user = userEvent.setup()
    reconcileMock.mockResolvedValue({ outcome: 'none' })
    renderComposed()

    await user.click(screen.getByRole('button', { name: i18n.t('driver.offer.accept') }))

    expect(acceptFn).toHaveBeenCalledWith('o1')
    // Store stays empty → ride view never appears.
    expect(useActiveOrderStore.getState().order).toBeNull()
    expect(screen.queryByRole('button', { name: i18n.t('driver.ride.arrive') })).not.toBeInTheDocument()
  })
})

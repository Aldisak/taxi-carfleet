import { Suspense, lazy, useEffect, useState } from 'react'
import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useDriverMe } from '../home/useDriverMe'
import { useGoOnline } from '../home/useGoOnline'
import { useGoOffline } from '../home/useGoOffline'
import { useDriverVehicles } from '../home/useDriverVehicles'
import { useOwnStatusSync } from '../home/useOwnStatusSync'
import { useRouteToast } from '../home/useRouteToast'
import { VehicleSelector, type VehicleOption } from '../home/VehicleSelector'
import { usePushSubscription } from '../../../shared/push/usePushSubscription'
import { useOwnPositionStore } from '../position/useOwnPositionStore'
import { useWakeLock } from '../position/useWakeLock'
import { useRideRestore } from '../ride/useRideRestore'
import { useLiveClear } from '../ride/useLiveClear'
import { useActiveOrder } from '../ride/useActiveOrder'
import { useRideTransition } from '../ride/useRideTransition'
import { RideSheet } from '../ride/RideSheet'
import { selectRouteLeg, legEndpoint, type LegEndpointOrder } from '../ride/routeLeg'
import { useQueuePendingCount } from '../queue/useTransitionQueue'
import { useRouteGeometry } from './useRouteGeometry'
import { selectDriverMapCamera } from './driverMapView'
import type { LatLng } from '../../../shared/map/mapCamera'

// The leaflet body is loaded lazily — the ONLY import site — so leaflet stays out of the eager
// /driver chunk (rules/web-performance.md#code-splitting; CLAUDE.md laneB3c leaflet-lazy discipline).
const DriverMapInner = lazy(() => import('./DriverMapInner'))

// The screen fills the DriverLayout <Content> flex region. It is NOT position:fixed inset:0 (that
// would paint over the in-flow BottomNav — see WI-5 AC / Assumption 2); the map absolute-fills the
// content region and overlay slots layer on top. BottomNav stays in flow below (hidden only during a
// ride, by DriverLayout).
const Screen = styled.div`
  position: relative;
  width: 100%;
  flex: 1;
  min-height: 0;
  overflow: hidden;
`

// The map is the background stacking layer; it absolute-fills the content region so it gets a
// definite size (the jsdom height-collapse trap is avoided by not relying on a height:100% chain).
const MapLayer = styled.div`
  position: absolute;
  inset: 0;
  z-index: ${({ theme }) => theme.zIndex.map};

  .leaflet-container {
    width: 100%;
    height: 100%;
  }
`

// Offline/Free overlay slot: an in-screen absolutely-positioned panel (NOT a fixed BottomSheet —
// that would collide with the visible BottomNav). It bottoms out at the content edge, above the
// in-flow BottomNav which is visible in these states (order == null). Left-padded off the bottom-left
// Mapy logo (CLAUDE.md UC-014 WI-2).
const BottomSlot = styled.div`
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: ${({ theme }) => theme.zIndex.overlay};
  padding: 0
    calc(${({ theme }) => theme.spacing.md} + env(safe-area-inset-right))
    calc(${({ theme }) => theme.spacing.md} + env(safe-area-inset-bottom))
    calc(${({ theme }) => theme.spacing.md} + env(safe-area-inset-left));
  pointer-events: none;

  > * {
    pointer-events: auto;
  }
`

const Panel = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  box-shadow: ${({ theme }) => theme.shadows.lg};
`

const WaitingLabel = styled.p`
  text-align: center;
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
  color: ${({ theme }) => theme.colors.text};
  margin: 0;
`

const HintText = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.warning};
  text-align: center;
  margin: 0;
`

const ErrorText = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.error};
  text-align: center;
  margin: 0;
`

const PrimaryButton = styled.button`
  width: 100%;
  min-height: ${({ theme }) => theme.touchTargets.primary};
  background: ${({ theme }) => theme.colors.primary};
  color: ${({ theme }) => theme.colors.textOnPrimary};
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  font-size: ${({ theme }) => theme.typography.fontSizeLg};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`

const SecondaryButton = styled.button`
  width: 100%;
  min-height: ${({ theme }) => theme.touchTargets.min};
  background: none;
  color: ${({ theme }) => theme.colors.textSecondary};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`

const Toast = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: ${({ theme }) => theme.zIndex.overlay};
  margin: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.success};
  color: ${({ theme }) => theme.colors.textOnPrimary};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
  text-align: center;
  border-radius: ${({ theme }) => theme.borderRadius.md};
`

// A LegEndpointOrder placeholder used to skip route-geometry fetching when there is no active order.
const NO_LEG_ORDER: LegEndpointOrder = { pickupLat: 0, pickupLng: 0, dropoffLat: null, dropoffLng: null }

/**
 * The single map-first /driver screen (UC-019 WI-5) — the /driver index child of DriverLayout.
 *
 * A full-bleed Mapy map (lazy DriverMapInner — the only import site, so leaflet stays out of the
 * eager /driver chunk) fills the DriverLayout <Content> region, with a state-driven overlay:
 *   Offline → VehicleSelector + "Začít směnu" (+ geolocation-permission hint)
 *   Free    → "Čekám na objednávku" (role=status) + "Ukončit směnu"
 *   active ride (order != null) → the RideSheet ride controls + the drawn route.
 *
 * Re-homes the DriverRidePage session hooks (design-review F-2): useRideRestore, useLiveClear
 * (F-04 mid-ride reassignment), useWakeLock, useActiveOrder, useQueuePendingCount, and the
 * runTransition → reconciledNote logic. All hooks are called unconditionally at the top so a
 * status/order race never drops the restore/reassignment machinery.
 */
export function DriverMapScreen() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const routeToast = useRouteToast()

  const { data: meData } = useDriverMe()
  const myDriverId = meData?.driverId
  const { ensureSubscribed } = usePushSubscription()

  // Push notifications are mandatory for drivers (assignment 05 §6). Register once on landing.
  useEffect(() => {
    void ensureSubscribed()
  }, [ensureSubscribed])

  // Own live position — ATOMIC one-field selector (CLAUDE.md laneB3c zustand-object-selector loop).
  const ownPos = useOwnPositionStore(s => s.position)
  const own: LatLng | null = ownPos ? { lat: ownPos.lat, lng: ownPos.lng } : null

  // Re-homed session hooks — always mounted (advisor B: never inside a status/order branch).
  useRideRestore(myDriverId)
  useLiveClear(myDriverId)
  useOwnStatusSync(myDriverId)
  const { order, noShowEnabled, noShowCountdownSeconds } = useActiveOrder()
  useWakeLock(order != null)
  const pendingCount = useQueuePendingCount()
  const { isPending, arrive, start, cancelNoShow } = useRideTransition()

  // A transition that reconciled after a definitive conflict (the order advanced past us).
  const [reconciledNote, setReconciledNote] = useState(false)

  // Offline flow state.
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null)
  const [hasLocation, setHasLocation] = useState(true) // optimistic until Permissions API says denied
  const { isPending: goOnlinePending, error: goOnlineError, goOnline } = useGoOnline()
  const { isPending: goOfflinePending, goOffline } = useGoOffline()
  // Fetch the fleet's active vehicles for the go-online picker (only while Offline).
  const { data: vehiclesData } = useDriverVehicles((meData?.status ?? 'Offline') === 'Offline')

  // Pre-populate the vehicle selector when meData arrives (loads after mount).
  useEffect(() => {
    if (meData?.currentVehicleId && !selectedVehicleId) {
      setSelectedVehicleId(meData.currentVehicleId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meData?.currentVehicleId])

  // Geolocation permission via the Permissions API; fall back to optimistic true when unavailable.
  useEffect(() => {
    if (typeof navigator === 'undefined') return
    if (!navigator.permissions) return
    navigator.permissions.query({ name: 'geolocation' })
      .then(result => {
        setHasLocation(result.state !== 'denied')
        result.onchange = () => { setHasLocation(result.state !== 'denied') }
      })
      .catch(() => { /* ignore — optimistic true */ })
  }, [])

  // ── Active-ride map wiring (safe when order == null: leg → null → fetch skipped) ──
  const hasDropoff = order?.dropoffLat != null && order?.dropoffLng != null
  const leg = order ? selectRouteLeg({ status: order.status, hasDropoff }) : null
  const legOrder: LegEndpointOrder = order
    ? {
        pickupLat: order.pickupLat,
        pickupLng: order.pickupLng,
        dropoffLat: order.dropoffLat,
        dropoffLng: order.dropoffLng,
      }
    : NO_LEG_ORDER
  const { geometry, durationSeconds } = useRouteGeometry({ leg, own, order: legOrder })

  const legEnd = legEndpoint(leg, legOrder)
  const cameraTarget = selectDriverMapCamera({ own, legStart: own, legEnd })

  const pickup: LatLng | null = order ? { lat: order.pickupLat, lng: order.pickupLng } : null
  const dropoff: LatLng | null =
    order && order.dropoffLat != null && order.dropoffLng != null
      ? { lat: order.dropoffLat, lng: order.dropoffLng }
      : null

  const etaMinutes = durationSeconds != null ? Math.ceil(durationSeconds / 60) : null

  async function runTransition(fn: (id: string) => Promise<{ type: string }>) {
    if (!order) return
    setReconciledNote(false)
    const outcome = await fn(order.id)
    // 'stale' = definitive conflict (terminal 409/404/KeyReused): the queue already dropped this
    // order's items and reconciled from GET /orders/{id}. Surface a short note.
    if (outcome.type === 'stale') setReconciledNote(true)
  }

  const status = meData?.status ?? 'Offline'
  const hasVehicle = !!selectedVehicleId

  // The picker lists the fleet's active vehicles (fetched). Keep the driver's own current vehicle
  // present even if it isn't in the active list (e.g. just deactivated) so the preselect still shows.
  const fetchedVehicles: VehicleOption[] = (vehiclesData?.items ?? []).map(v => ({
    id: v.id,
    plate: v.plate,
    make: v.make,
    model: v.model,
  }))
  const vehicles: VehicleOption[] =
    meData?.currentVehicleId && !fetchedVehicles.some(v => v.id === meData.currentVehicleId)
      ? [
          {
            id: meData.currentVehicleId,
            plate: meData.currentVehiclePlate ?? meData.currentVehicleId.slice(0, 8),
            make: '',
            model: '',
          },
          ...fetchedVehicles,
        ]
      : fetchedVehicles

  function handleGoOnline() {
    if (selectedVehicleId) void goOnline(selectedVehicleId)
  }

  return (
    <Screen>
      <MapLayer>
        <Suspense fallback={null}>
          <DriverMapInner
            own={own}
            pickup={pickup}
            dropoff={dropoff}
            routeGeometry={geometry}
            cameraTarget={cameraTarget}
          />
        </Suspense>
      </MapLayer>

      {routeToast && <Toast role="status">{t(routeToast)}</Toast>}

      {order ? (
        <RideSheet
          order={order}
          noShowEnabled={noShowEnabled}
          noShowCountdownSeconds={noShowCountdownSeconds}
          etaMinutes={etaMinutes}
          onArrive={() => { void runTransition(arrive) }}
          onStart={() => { void runTransition(start) }}
          onComplete={() => navigate('/driver/ride/complete')}
          onNoShow={() => { void runTransition(cancelNoShow) }}
          isPending={isPending}
          pendingCount={pendingCount}
          reconciledNote={reconciledNote}
        />
      ) : (
        <BottomSlot>
          {status === 'Offline' ? (
            <Panel>
              <VehicleSelector
                vehicles={vehicles}
                selectedVehicleId={selectedVehicleId}
                onSelect={id => setSelectedVehicleId(id)}
              />
              {!hasLocation && <HintText>{t('driver.home.vehicle.noLocationHint')}</HintText>}
              {goOnlineError && <ErrorText>{t(goOnlineError)}</ErrorText>}
              <PrimaryButton
                type="button"
                disabled={!hasVehicle || !hasLocation || goOnlinePending}
                onClick={handleGoOnline}
              >
                {t('driver.home.status.startShift')}
              </PrimaryButton>
            </Panel>
          ) : (
            <Panel>
              <WaitingLabel role="status">{t('driver.home.status.waitingForOrder')}</WaitingLabel>
              <SecondaryButton
                type="button"
                disabled={goOfflinePending}
                onClick={() => { void goOffline() }}
              >
                {t('driver.home.status.endShift')}
              </SecondaryButton>
            </Panel>
          )}
        </BottomSlot>
      )}
    </Screen>
  )
}

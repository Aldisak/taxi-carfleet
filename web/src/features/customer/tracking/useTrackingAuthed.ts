import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getMyActiveOrder, getOrder, getOrderByCode } from '../../../shared/api/client'
import type { OrderDetailDto, TrackDto } from '../../../shared/api/client'
import { useFleetHub, useHubConnectionState, invokeHub } from '../../../shared/realtime/useFleetHub'
import { usePositionStore } from '../../../shared/realtime/usePositionStore'
import { selectCarMarker, type LatLng } from './trackingMarker'
import type { TrackVm } from './headlineRules'

/** Result of {@link useTrackingAuthed}. */
export interface UseTrackingAuthedResult {
  /** The resolved order id (from getMyActiveOrder) or null for a terminal/cold load. */
  orderId: string | null
  /** Normalized headline view-model (by-code DTO + full detail price + live status). */
  vm: TrackVm
  /** Car marker position (live store entry wins, else the DTO's last-known position). */
  carMarker: LatLng | null
  pickup: LatLng | null
  /** Pickup address for the details block. */
  pickupAddress: string | null
  /** Scheduled departure time (ISO) for the details block, or null (ASAP). */
  scheduledAt: string | null
  isLoading: boolean
  isError: boolean
}

/** Builds the normalized headline VM from the by-code DTO, optional full detail, and live status. */
function buildVm(byCode: TrackDto | undefined, detail: OrderDetailDto | undefined): TrackVm {
  // Status prefers the live-patched full detail (useFleetHub patches ['orders','detail',id] in
  // place on OrderChanged), then the by-code DTO.
  const status = detail?.status ?? byCode?.status ?? 'New'
  // Price prefers the full order detail (final → fixed → estimate); else the by-code display price.
  const detailPrice = detail
    ? detail.finalPriceCzk ?? detail.fixedPriceCzk ?? detail.estimatedPriceCzk
    : null
  return {
    status,
    driverFirstName: byCode?.driverFirstName ?? null,
    etaMinutes: byCode?.etaMinutes ?? null,
    vehiclePlate: byCode?.vehiclePlate ?? null,
    vehicleColor: byCode?.vehicleColor ?? null,
    dropoffAddress: byCode?.dropoffAddress ?? detail?.dropoffAddress ?? null,
    priceCzk: detailPrice ?? byCode?.displayPriceCzk ?? null,
  }
}

/**
 * Authed customer tracking (logged-in). Reuses the single /hubs/fleet SignalR connection
 * (useFleetHub singleton — never a second connection) and calls Subscribe(orderId) so the
 * headline updates via the in-place detail-cache patch and the car marker moves on
 * DriverPositionChanged (rules/web-realtime.md). The order id is resolved from getMyActiveOrder
 * (the route param is publicCode, and neither by-code nor detail carries the id); cancel + Subscribe
 * are only meaningful for non-terminal orders, which is exactly what getMyActiveOrder returns.
 * For a terminal/cold load (no active order) it still renders the by-code DTO read-only.
 */
export function useTrackingAuthed(code: string): UseTrackingAuthedResult {
  // Gate on a non-empty code so the hook is inert when the page is in public/none mode
  // (both hooks are always called to satisfy the rules of hooks; only the active one fetches).
  const enabled = code.length > 0

  // Reuse the session-wide hub singleton so Subscribe has a live connection — but ONLY in authed
  // mode. In public/none mode there is no access token, so starting the [Authorize] /hubs/fleet
  // connection would enter a doomed cold-start retry loop (rules/web-realtime.md#single-hub-singleton).
  useFleetHub(enabled)
  const connectionState = useHubConnectionState()
  const positions = usePositionStore((s) => s.positions)

  // Always-available reduced DTO: fields (driver, vehicle, pickup, dropoff) + last-known position.
  const byCodeQuery = useQuery({
    queryKey: ['orders', 'track', 'by-code', code],
    queryFn: () => getOrderByCode(code),
    enabled,
    retry: false,
  })

  // Resolve the order id (for Subscribe + cancel) via the single active order.
  const activeQuery = useQuery({
    queryKey: ['orders', 'mine', 'active'],
    queryFn: getMyActiveOrder,
    enabled,
    retry: false,
  })

  const active = activeQuery.data
  const orderId = active && active.publicCode === code ? active.id : null

  // Full order detail (for the price + the live-patched status). useFleetHub patches this exact
  // key in place on OrderChanged.
  const detailQuery = useQuery({
    queryKey: ['orders', 'detail', orderId],
    queryFn: () => getOrder(orderId as string),
    enabled: orderId != null,
    retry: false,
  })

  // Subscribe to the order's SignalR group once the id is known and the hub is connected.
  useEffect(() => {
    if (orderId == null || connectionState !== 'connected') return
    void invokeHub('Subscribe', orderId)
  }, [orderId, connectionState])

  const detail = detailQuery.data
  const byCode = byCodeQuery.data
  const vm = buildVm(byCode, detail)

  // Note: the final price on completion (Meter/Estimate orders, not in the OrderChanged payload)
  // arrives because useFleetHub invalidates ['orders','detail',id] on every OrderChanged, which
  // refetches this active query — so finalPriceCzk is current without a bespoke refetch here.

  const driverId = detail?.driverId ?? null
  const livePosition = driverId ? positions.get(driverId) ?? null : null
  const carMarker = selectCarMarker({
    livePosition: livePosition ? { lat: livePosition.lat, lng: livePosition.lng } : null,
    fallbackPosition: byCode?.position ?? null,
  })

  const pickup =
    detail && detail.pickupLat != null && detail.pickupLng != null
      ? { lat: detail.pickupLat, lng: detail.pickupLng }
      : null

  return {
    orderId,
    vm,
    carMarker,
    pickup,
    pickupAddress: byCode?.pickupAddress ?? detail?.pickupAddress ?? null,
    scheduledAt: byCode?.scheduledAt ?? detail?.scheduledAt ?? null,
    isLoading: byCodeQuery.isLoading,
    isError: byCodeQuery.isError,
  }
}

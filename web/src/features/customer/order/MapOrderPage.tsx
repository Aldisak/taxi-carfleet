import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'
import { Button } from '../../../shared/ui/Button'
import { CustomerMapShell } from '../shell/CustomerMapShell'
import { useReverseGeocode } from '../shell/useReverseGeocode'
import { useCustomerLocation } from '../shell/useCustomerLocation'
import type { LatLng } from '../shell/mapCamera'
import { useGeoConfig } from '../../../shared/map/useGeoConfig'
import { DestinationSearch } from './DestinationSearch'
import { PriceSheet } from './PriceSheet'
import { usePriceQuote } from './usePriceQuote'
import { useRoute } from './useRoute'
import { pickSuggestLocation } from './suggestLocation'
import {
  clearDestination,
  initialOrderFlow,
  selectDestination,
  setPickup,
  type OrderFlowState,
  type SelectedPlace,
} from './orderFlowState'
import { orderCameraPoints } from './orderCamera'

// The top search slot: a pickup row + the destination search + the GPS controls.
const LocationControls = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

// The pickup row (handoff §3 Home): accent dot · reverse-geocoded pickup address · "Změnit".
const PickupRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: var(--surface);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-card);
`

const PickupDot = styled.span`
  flex: none;
  width: 10px;
  height: 10px;
  border-radius: var(--r-pill);
  background: var(--accent);
`

const PickupText = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
`

const PickupCaption = styled.span`
  font-size: var(--fs-caption);
  color: var(--ink-2);
`

const PickupAddress = styled.span`
  font-size: var(--fs-body-lg);
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

// A status pill for the GPS denied/unavailable/locating messages, legible over the map.
const LocationStatus = styled.p`
  margin: 0;
  align-self: flex-start;
  max-width: 100%;
  padding: 6px 12px;
  background: var(--surface);
  color: var(--ink-2);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-card);
  font-size: var(--fs-caption);
`

/**
 * The map-first customer order page (UC-015 WI-4) — the single `/customer` surface, mounted as a
 * SIBLING of the CustomerLayout route group (mirroring `/customer/login`) so it owns the full
 * viewport map shell without CustomerLayout's chrome nesting.
 *
 * It owns the order-flow selection state (orderFlowState) and composes CustomerMapShell:
 * - topSlot = DestinationSearch ("Kam to bude?"); picking a suggestion sets the destination and
 *   shows the price sheet.
 * - bottomSlot = PriceSheet (only once a destination is set), driven by usePriceQuote with
 *   allowAnonymous:true so a logged-out visitor sees the price before the inline login step.
 *
 * Pickup defaults to the map's GPS/center-pin (UC-014): moving the map fires onCenterChange →
 * debounced useReverseGeocode → the pickup label + coords update — but ONLY in the `search`
 * phase. Once a destination is set the camera does a fitBounds over pickup+destination, so the
 * map center is no longer the pickup; freezing pickup in the `destinationSet` phase prevents a
 * mid-route center from overwriting the real pickup.
 *
 * Camera points come from the pure orderCamera.orderCameraPoints (0 → no move, 1 pickup → setView,
 * pickup+destination → fitBounds); the shell's CameraController decides setView vs fitBounds from
 * those points. onOrdered(publicCode) → navigate('/customer/t/' + publicCode) (TrackingPage is
 * untouched — UC-016 owns it).
 */
export function MapOrderPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [flow, setFlow] = useState<OrderFlowState>(initialOrderFlow)
  // The last settled map center — reverse-geocoded (debounced) into the pickup label while in
  // the search phase. Frozen (not updated) once a destination is set.
  const [pendingCenter, setPendingCenter] = useState<LatLng | null>(null)

  // A one-shot camera override that drives the map to the GPS coords (react-leaflet reads center
  // only at mount, so a recenter is expressed as a single-point cameraTarget). Cleared once the
  // map settles (onCenterChange), reverting the camera to orderCameraPoints(pickup, destination).
  const [recenterTo, setRecenterTo] = useState<LatLng | null>(null)

  const reverse = useReverseGeocode(pendingCenter)
  const reverseLabel = reverse.data?.label ?? null

  // Browser GPS (one-shot + Permissions API). Feeds the suggest `near` tier and drives the initial
  // recenter so the pickup defaults to the customer's current location (map-pin stays the fallback).
  const location = useCustomerLocation()

  // Auto-recenter to the FIRST granted GPS fix exactly once (a ref, not state, so a later user drag
  // is never overridden). Only in the search phase — "GPS as pickup" is a pre-destination action;
  // once a destination is set the camera wants the pickup+destination fitBounds.
  const autoRecenterDoneRef = useRef(false)
  useEffect(() => {
    if (autoRecenterDoneRef.current) return
    if (location.status !== 'granted' || location.coords === null) return
    if (flow.phase !== 'search') return
    autoRecenterDoneRef.current = true
    setRecenterTo(location.coords)
  }, [location.status, location.coords, flow.phase])

  // The fleet's configured default map center — the weakest `near` fallback (config-center tier).
  const geoConfig = useGeoConfig()
  const configCenter: LatLng | null = geoConfig.data
    ? { lat: geoConfig.data.mapCenterLat, lng: geoConfig.data.mapCenterLng }
    : null

  // Best-available location hint for address suggest ranking (UC-018 WI-2): map center → GPS →
  // config center. GPS is a designed-in tier but supplied as null today (no geolocation hook in the
  // customer shell yet — a future wire is a one-line change). pickSuggestLocation coarse-rounds the
  // result to 2 decimals so the suggest query key stays stable across tiny map nudges — no useMemo
  // needed (rules/web-performance.md#memoization-policy).
  const suggestNear = pickSuggestLocation({
    mapCenter: pendingCenter,
    gpsLocation: location.coords,
    configCenter,
  })

  // Center changes update the pickup only in the search phase (freeze pickup once a destination
  // is chosen — the fitBounds center is no longer the pickup). Once the map settles, clear the
  // one-shot GPS recenter so the camera reverts to orderCameraPoints (the user can drag away).
  const handleCenterChange = (coords: LatLng) => {
    setPendingCenter(coords)
    setRecenterTo((prev) => (prev === null ? prev : null))
  }

  // The "Use my location" tap: re-request a fix; if coords are already known, recenter now (a fresh
  // fix flowing in later is picked up by the auto-recenter effect only once — this covers the case
  // where the user re-taps after already having a fix, bypassing the once-guard).
  const handleUseMyLocation = () => {
    location.request()
    if (location.coords !== null) {
      setRecenterTo(location.coords)
    }
  }

  // Fold the resolved reverse-geocode label into the pickup (search phase only). Effect-gated on
  // the resolved label + coords so it never loops (setView to the current center is a no-op).
  useEffect(() => {
    if (pendingCenter === null) return
    setFlow((prev) => {
      if (prev.phase !== 'search') return prev
      const label = reverseLabel ?? t('customer.mapOrder.pickupLabel')
      const pickup: SelectedPlace = { label, lat: pendingCenter.lat, lng: pendingCenter.lng }
      // Skip if the pickup is already at this exact coordinate + label (avoids a redundant setState).
      if (prev.pickup && prev.pickup.lat === pickup.lat && prev.pickup.lng === pickup.lng && prev.pickup.label === pickup.label) {
        return prev
      }
      return setPickup(prev, pickup)
    })
  }, [pendingCenter, reverseLabel, t])

  const quote = usePriceQuote({
    pickupLat: flow.pickup?.lat ?? null,
    pickupLng: flow.pickup?.lng ?? null,
    dropoffLat: flow.destination?.lat ?? null,
    dropoffLng: flow.destination?.lng ?? null,
    allowAnonymous: true,
  })

  const handleSelectDestination = (place: SelectedPlace) => {
    setFlow((prev) => selectDestination(prev, place))
  }

  const handleCancel = () => {
    setFlow((prev) => clearDestination(prev))
  }

  const handleOrdered = (publicCode: string) => {
    navigate(`/customer/t/${publicCode}`)
  }

  // The one-shot GPS recenter overrides the normal pickup/destination framing while active.
  const cameraTarget = recenterTo ? [recenterTo] : orderCameraPoints(flow.pickup, flow.destination)
  const showSheet = flow.phase === 'destinationSet' && flow.destination !== null

  // Best-effort fastest-route preview (pickup → destination). Enabled only when both are set; a
  // fetch failure degrades to geometry null and never blocks the order button.
  const route = useRoute(flow.pickup, flow.destination)

  const locationStatusMessage =
    location.status === 'denied'
      ? t('customer.shell.gpsDenied')
      : location.status === 'unavailable'
        ? t('customer.shell.gpsUnavailable')
        : location.status === 'locating'
          ? t('customer.shell.locating')
          : null

  return (
    <CustomerMapShell
      cameraTarget={cameraTarget}
      onCenterChange={handleCenterChange}
      routeGeometry={route.geometry}
      topSlot={
        <LocationControls>
          <PickupRow>
            <PickupDot aria-hidden="true" />
            <PickupText>
              <PickupCaption>{t('customer.mapOrder.pickupHere')}</PickupCaption>
              <PickupAddress>{flow.pickup?.label ?? t('customer.mapOrder.pickupLabel')}</PickupAddress>
            </PickupText>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleUseMyLocation}
              disabled={location.status === 'unavailable'}
            >
              {t('customer.mapOrder.pickupChange')}
            </Button>
          </PickupRow>
          <DestinationSearch onSelectDestination={handleSelectDestination} near={suggestNear} />
          <Button
            variant="secondary"
            size="sm"
            onClick={handleUseMyLocation}
            disabled={location.status === 'unavailable'}
          >
            {t('customer.custom.useMyLocation')}
          </Button>
          {locationStatusMessage && (
            <LocationStatus role="status">{locationStatusMessage}</LocationStatus>
          )}
        </LocationControls>
      }
      bottomSlot={
        showSheet ? (
          <PriceSheet
            pickup={flow.pickup}
            destination={flow.destination}
            quote={quote}
            onCancel={handleCancel}
            onOrdered={handleOrdered}
          />
        ) : undefined
      }
    />
  )
}

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CustomerMapShell } from '../shell/CustomerMapShell'
import { useReverseGeocode } from '../shell/useReverseGeocode'
import type { LatLng } from '../shell/mapCamera'
import { DestinationSearch } from './DestinationSearch'
import { PriceSheet } from './PriceSheet'
import { usePriceQuote } from './usePriceQuote'
import {
  clearDestination,
  initialOrderFlow,
  selectDestination,
  setPickup,
  type OrderFlowState,
  type SelectedPlace,
} from './orderFlowState'
import { orderCameraPoints } from './orderCamera'

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

  const reverse = useReverseGeocode(pendingCenter)
  const reverseLabel = reverse.data?.label ?? null

  // Center changes update the pickup only in the search phase (freeze pickup once a destination
  // is chosen — the fitBounds center is no longer the pickup).
  const handleCenterChange = (coords: LatLng) => {
    setPendingCenter(coords)
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

  const cameraTarget = orderCameraPoints(flow.pickup, flow.destination)
  const showSheet = flow.phase === 'destinationSet' && flow.destination !== null

  return (
    <CustomerMapShell
      cameraTarget={cameraTarget}
      onCenterChange={handleCenterChange}
      topSlot={<DestinationSearch onSelectDestination={handleSelectDestination} />}
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

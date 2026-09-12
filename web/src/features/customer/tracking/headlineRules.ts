/**
 * Normalized tracking view-model fed to {@link deriveHeadline}. Populated from the authed
 * TrackDto + full order detail (getOrder price) or the public TrackDto (displayPriceCzk).
 * Status is the backend OrderStatus name string ("New"|"Assigned"|…).
 */
export interface TrackVm {
  status: string
  driverFirstName: string | null
  /** Minutes until pickup; null pre-06 (OSRM ETA deferred) → headline omits "~min". */
  etaMinutes: number | null
  vehiclePlate: string | null
  vehicleColor: string | null
  dropoffAddress: string | null
  /** Display price in integer CZK; null when unknown. */
  priceCzk: number | null
}

/**
 * Structured headline descriptor. The Czech string is NOT baked here (rules/web-react-style.md
 * #i18n-czech-first — all user-facing strings go through useTranslation); StatusHeadline.tsx
 * composes `t(key, values)`. The boolean flags drive which sections the tracking screen shows.
 */
export interface HeadlineDescriptor {
  /** i18n key for the one-line headline. */
  key: string
  /** Interpolation values for the headline (name, eta, price). */
  values: Record<string, string | number>
  /** Show the vehicle plate + color prominently (Arrived). */
  showVehicle: boolean
  /** Show the dropoff address in the headline block (InProgress). */
  showDropoff: boolean
  /** Show the rating seam (Completed — B-rating drops its form here). */
  showRating: boolean
  /** Show the "Zavolat" call fallback (Cancelled). */
  showCall: boolean
  /** Cancel is offered (New/Assigned/Accepted only). */
  showCancel: boolean
  /** After Accepted, show the "řidič už jede" hint next to cancel. */
  showAcceptedHint: boolean
}

/** Statuses where the customer may still cancel the order. */
const CANCELLABLE = new Set(['New', 'Assigned', 'Accepted'])

/**
 * Maps a tracking view-model to a structured headline descriptor (pure, unit-tested).
 * Every state produces exactly one headline key; the flags decide which extra blocks render.
 * An unknown status degrades to the "New" headline and blocks cancel (safe default).
 */
export function deriveHeadline(vm: TrackVm): HeadlineDescriptor {
  const base: HeadlineDescriptor = {
    key: 'customer.tracking.headline.new',
    values: {},
    showVehicle: false,
    showDropoff: false,
    showRating: false,
    showCall: false,
    showCancel: CANCELLABLE.has(vm.status),
    showAcceptedHint: vm.status === 'Accepted',
  }

  switch (vm.status) {
    case 'New':
      return base

    case 'Assigned':
    case 'Accepted': {
      const name = vm.driverFirstName ?? ''
      if (vm.etaMinutes != null) {
        return { ...base, key: 'customer.tracking.headline.assignedEta', values: { name, eta: vm.etaMinutes } }
      }
      return { ...base, key: 'customer.tracking.headline.assignedNoEta', values: { name } }
    }

    case 'Arrived':
      return { ...base, key: 'customer.tracking.headline.arrived', showVehicle: true }

    case 'InProgress':
      return { ...base, key: 'customer.tracking.headline.inProgress', showDropoff: true }

    case 'Completed':
      if (vm.priceCzk != null) {
        return { ...base, key: 'customer.tracking.headline.completed', values: { price: vm.priceCzk }, showRating: true }
      }
      return { ...base, key: 'customer.tracking.headline.completedNoPrice', showRating: true }

    case 'Cancelled':
      return { ...base, key: 'customer.tracking.headline.cancelled', showCall: true }

    default:
      // Unknown status — safe default: new headline, no cancel.
      return { ...base, showCancel: false, showAcceptedHint: false }
  }
}

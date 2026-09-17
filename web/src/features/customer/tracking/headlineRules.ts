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
 * Stable phase discriminant for the map-first tracking sheet (UC-016 WI-1). One phase per
 * status so TrackingSheet renders the right block from a single source of truth instead of
 * re-deriving the status switch in the component. NOTE the deliberate name inversion: backend
 * status "Assigned" collapses to the `searching` phase (per spec §2 — "Looking for drivers…"
 * for New AND Assigned, so the searching loader is never paired with a "driver on the way"
 * heading), and backend status "Accepted" maps to the `assigned` phase.
 */
export type TrackPhase =
  | 'searching'
  | 'assigned'
  | 'arrived'
  | 'inProgress'
  | 'completed'
  | 'cancelled'

/**
 * Structured headline descriptor. The Czech string is NOT baked here (rules/web-react-style.md
 * #i18n-czech-first — all user-facing strings go through useTranslation); the tracking sheet
 * composes `t(key, values)`. The boolean flags drive which sections the tracking screen shows.
 */
export interface HeadlineDescriptor {
  /** Stable phase discriminant driving which sheet block renders. */
  phase: TrackPhase
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
    phase: 'searching',
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
    // New AND Assigned collapse to the searching phase with the same looking-for-driver heading
    // (spec §2) — the searching loader is never paired with a "driver on the way" heading.
    case 'New':
    case 'Assigned':
      return base

    case 'Accepted': {
      const name = vm.driverFirstName ?? ''
      if (vm.etaMinutes != null) {
        return { ...base, phase: 'assigned', key: 'customer.tracking.headline.assignedEta', values: { name, eta: vm.etaMinutes } }
      }
      return { ...base, phase: 'assigned', key: 'customer.tracking.headline.assignedNoEta', values: { name } }
    }

    case 'Arrived':
      return { ...base, phase: 'arrived', key: 'customer.tracking.headline.arrived', showVehicle: true }

    case 'InProgress':
      return { ...base, phase: 'inProgress', key: 'customer.tracking.headline.inProgress', showDropoff: true }

    case 'Completed':
      if (vm.priceCzk != null) {
        return { ...base, phase: 'completed', key: 'customer.tracking.headline.completed', values: { price: vm.priceCzk }, showRating: true }
      }
      return { ...base, phase: 'completed', key: 'customer.tracking.headline.completedNoPrice', showRating: true }

    case 'Cancelled':
      return { ...base, phase: 'cancelled', key: 'customer.tracking.headline.cancelled', showCall: true }

    default:
      // Unknown status — safe default: searching phase, new headline, no cancel.
      return { ...base, showCancel: false, showAcceptedHint: false }
  }
}

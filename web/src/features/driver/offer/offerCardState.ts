/**
 * Pure offer-card UI-transition logic (UC-019 WI-1).
 *
 * Lifts the branchy accept/decline result → UI-transition decision out of the
 * OfferTakeover/OfferCard component so WI-2 stays presentational and unit-testable.
 * No react, no leaflet — pure.
 */

/** The offer card's view phase. */
export type OfferCardPhase = 'offer' | 'declining' | 'expired'

/** The outcome kind reported by an accept/decline attempt. */
export type OfferActionKind = 'success' | 'stale' | 'offline' | 'noReason'

/** The UI transition an outcome implies. */
export interface OfferActionDecision {
  /** The phase the card should move to. */
  nextPhase: OfferCardPhase
  /** Milliseconds to wait before dismissing (0 = dismiss now, null = do not dismiss). */
  dismissAfterMs: number | null
  /** Whether to show the offline hint. */
  showOffline: boolean
  /** Whether to show the "offer no longer available" stale banner. */
  showStale: boolean
  /** Whether to show the "pick a decline reason" error. */
  showReasonError: boolean
}

/**
 * Maps an accept/decline outcome (against the current phase) to a UI-transition decision:
 * - success → dismiss immediately (dismissAfterMs 0)
 * - stale → show the stale banner, move to 'expired', dismiss after 2000ms
 * - offline → show the offline hint, stay on the current phase, do not dismiss
 * - noReason → show the reason error, stay on the current phase, do not dismiss
 */
export function offerActionOutcome(
  kind: OfferActionKind,
  current: OfferCardPhase,
): OfferActionDecision {
  switch (kind) {
    case 'success':
      return {
        nextPhase: current,
        dismissAfterMs: 0,
        showOffline: false,
        showStale: false,
        showReasonError: false,
      }
    case 'stale':
      return {
        nextPhase: 'expired',
        dismissAfterMs: 2000,
        showOffline: false,
        showStale: true,
        showReasonError: false,
      }
    case 'offline':
      return {
        nextPhase: current,
        dismissAfterMs: null,
        showOffline: true,
        showStale: false,
        showReasonError: false,
      }
    case 'noReason':
      return {
        nextPhase: current,
        dismissAfterMs: null,
        showOffline: false,
        showStale: false,
        showReasonError: true,
      }
  }
}

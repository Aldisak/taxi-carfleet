/**
 * Pure destination-first selection state machine for the customer map-order flow (UC-015 WI-1).
 *
 * Holds ONLY the selection decision — which phase the flow is in (searching for a destination
 * vs. a destination is set), the chosen destination, and the current pickup. It imports nothing
 * from leaflet or react so it stays eager-safe and unit-testable
 * (rules/web-architecture.md#pure-logic-modules). The MapOrderPage (WI-4) owns this state via
 * useState and renders from it; the search overlay (WI-2) and price sheet (WI-3) only call back.
 */

/** A resolved place (from a suggestion pick or a reverse-geocoded map center). */
export interface SelectedPlace {
  label: string
  lat: number
  lng: number
}

/**
 * The order-flow selection state.
 * - `search` — no destination yet; the top search overlay is the primary surface.
 * - `destinationSet` — a destination is chosen; the price sheet is shown.
 * The pickup is orthogonal to the phase (a GPS/center-pin pickup can exist before a destination).
 */
export interface OrderFlowState {
  phase: 'search' | 'destinationSet'
  destination: SelectedPlace | null
  pickup: SelectedPlace | null
}

/** The initial flow state: searching, nothing selected. */
export function initialOrderFlow(): OrderFlowState {
  return { phase: 'search', destination: null, pickup: null }
}

/** Records a chosen destination and moves to the destinationSet phase. */
export function selectDestination(state: OrderFlowState, destination: SelectedPlace): OrderFlowState {
  return { ...state, phase: 'destinationSet', destination }
}

/** Clears the destination and returns to the search phase, preserving the pickup. */
export function clearDestination(state: OrderFlowState): OrderFlowState {
  return { ...state, phase: 'search', destination: null }
}

/** Records/updates the current pickup, leaving the phase and destination untouched. */
export function setPickup(state: OrderFlowState, pickup: SelectedPlace): OrderFlowState {
  return { ...state, pickup }
}

/**
 * A button derived from an allowedAction string.
 *
 * The visible label is NOT carried here — the consumer renders it via
 * `t('orders.actions.' + action)` so every transition label is localised (dispatcher
 * redesign §3). Only the raw action string and the two behaviour flags are returned.
 */
export interface TransitionButton {
  /** The raw action string from the backend (e.g. 'assign', 'cancel'). */
  action: string
  /** True if this action requires selecting a driver (assign, reassign). */
  needsDriverPicker: boolean
  /** True if this action requires a cancellation reason (cancel). */
  needsReason: boolean
}

/** Actions that require a driver picker UI. */
const NEEDS_DRIVER_PICKER = new Set(['assign', 'reassign'])

/** Actions that require a reason text. */
const NEEDS_REASON = new Set(['cancel'])

/**
 * Derives the set of transition buttons to render from the order's allowedActions list.
 *
 * @param allowedActions - Array of lowercase action strings from the backend (e.g. ['assign','cancel']).
 * @returns Ordered list of button descriptors.
 */
export function deriveTransitionButtons(allowedActions: string[]): TransitionButton[] {
  return allowedActions.map((action) => ({
    action,
    needsDriverPicker: NEEDS_DRIVER_PICKER.has(action),
    needsReason: NEEDS_REASON.has(action),
  }))
}

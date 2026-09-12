/** A button derived from an allowedAction string. */
export interface TransitionButton {
  /** The raw action string from the backend (e.g. 'assign', 'cancel'). */
  action: string
  /** Czech label for the button. Falls back to the action string if unknown. */
  label: string
  /** True if this action requires selecting a driver (assign, reassign). */
  needsDriverPicker: boolean
  /** True if this action requires a cancellation reason (cancel). */
  needsReason: boolean
}

/** Czech labels for known transition actions. */
const ACTION_LABELS: Record<string, string> = {
  assign: 'Přiřadit',
  reassign: 'Přeřadit',
  cancel: 'Zrušit',
  accept: 'Přijmout',
  arrive: 'Na místě',
  start: 'Zahájit jízdu',
  complete: 'Dokončit',
  decline: 'Odmítnout',
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
    label: ACTION_LABELS[action] ?? action,
    needsDriverPicker: NEEDS_DRIVER_PICKER.has(action),
    needsReason: NEEDS_REASON.has(action),
  }))
}

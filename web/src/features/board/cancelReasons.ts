/** Predefined cancel reason codes (Czech). */
export const CANCEL_REASON_CODES = [
  'zákazník zrušil',
  'nedorazil',
  'omyl',
  'jiný',
] as const

export type CancelReasonCode = (typeof CANCEL_REASON_CODES)[number]

/**
 * Builds the reason string to send to the server.
 * When code is 'jiný' and freeText is provided, appends ": " + freeText.
 */
export function buildCancelReason(code: CancelReasonCode, freeText?: string): string {
  if (code === 'jiný' && freeText && freeText.trim()) {
    return `jiný: ${freeText.trim()}`
  }
  return code
}

/** Returns true when the given reason code requires a free text field. */
export function reasonRequiresFreeText(code: CancelReasonCode): boolean {
  return code === 'jiný'
}

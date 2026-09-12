/** Immutable state for the one-time password display. */
export interface OneTimePasswordState {
  /** The plaintext password, visible only immediately after reveal. Null otherwise. */
  readonly password: string | null
  /** Whether the password is currently visible. */
  readonly isRevealed: boolean
  /** Transition: reveal a new password (e.g. from a reset-password API response). */
  reveal(password: string): OneTimePasswordState
  /** Transition: dismiss the revealed password (clears it permanently until next reveal). */
  dismiss(): OneTimePasswordState
}

function makeState(password: string | null, isRevealed: boolean): OneTimePasswordState {
  return {
    password,
    isRevealed,
    reveal: (p: string) => makeState(p, true),
    dismiss: () => isRevealed ? makeState(null, false) : makeState(null, false),
  }
}

/** Creates the initial idle state. */
export function createOneTimePasswordState(): OneTimePasswordState {
  return makeState(null, false)
}

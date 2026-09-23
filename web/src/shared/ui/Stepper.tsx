import styled from 'styled-components'

/**
 * Props for the shared {@link Stepper} — a numeric value flanked by round − / +
 * buttons. Presentational only: the buttons' accessible names are supplied by the
 * caller. Controlled: the parent owns `value`. Emitted values are clamped to
 * `[min, max]`.
 */
export interface StepperProps {
  /** The current numeric value. */
  value: number
  /** Called with the clamped next value on − / +. */
  onChange: (v: number) => void
  /** Lowest allowed value. Defaults to 0. */
  min?: number
  /** Highest allowed value. Defaults to 99. */
  max?: number
  /** Accessible name for the decrement button. */
  decrementLabel: string
  /** Accessible name for the increment button. */
  incrementLabel: string
  /** Optional accessible name for the value readout (e.g. "Počet zavazadel"). */
  ariaLabel?: string
}

const Row = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 12px;
`

const RoundButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border: none;
  border-radius: var(--r-pill);
  background: var(--surface-2);
  color: var(--ink);
  font-family: inherit;
  font-size: var(--fs-headline);
  font-weight: var(--fw-bold);
  cursor: pointer;
  transition: transform var(--dur-press);

  &:active {
    transform: scale(0.94);
  }

  &:disabled {
    cursor: not-allowed;
    background: var(--surface-3);
    color: var(--ink-3);
  }
`

const Value = styled.span`
  min-width: 2ch;
  text-align: center;
  font-size: var(--fs-headline);
  font-weight: var(--fw-extra);
  color: var(--ink);
`

/** A numeric stepper with clamped round − / + controls. */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = 99,
  decrementLabel,
  incrementLabel,
  ariaLabel,
}: StepperProps): JSX.Element {
  const clamp = (n: number): number => Math.max(min, Math.min(max, n))
  const atMin = value <= min
  const atMax = value >= max

  return (
    <Row>
      <RoundButton
        type="button"
        aria-label={decrementLabel}
        disabled={atMin}
        onClick={() => onChange(clamp(value - 1))}
      >
        −
      </RoundButton>
      <Value aria-label={ariaLabel} aria-live="polite">
        {value}
      </Value>
      <RoundButton
        type="button"
        aria-label={incrementLabel}
        disabled={atMax}
        onClick={() => onChange(clamp(value + 1))}
      >
        +
      </RoundButton>
    </Row>
  )
}

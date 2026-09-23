import styled from 'styled-components'

/** One selectable segment: a stable `value` and its visible `label`. */
export interface SegmentOption {
  /** The value emitted when this segment is chosen. */
  value: string
  /** Visible segment label. */
  label: string
}

/**
 * Props for the shared {@link Segmented} — a two-or-more-way segmented control
 * (e.g. "Hned / Na čas"). Presentational only: labels and the group's accessible
 * name are supplied by the caller. Controlled: the parent owns `value`.
 */
export interface SegmentedProps {
  /** The selectable segments, rendered left to right. */
  options: SegmentOption[]
  /** The currently selected value. */
  value: string
  /** Called with the chosen value when a segment is pressed. */
  onChange: (v: string) => void
  /** Accessible name for the control group. */
  ariaLabel: string
}

const Track = styled.div`
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  border-radius: var(--r-md);
  background: var(--surface-2);
`

const Segment = styled.button<{ $selected: boolean }>`
  flex: 1 1 auto;
  min-height: 44px;
  padding: 0 16px;
  border: none;
  border-radius: var(--r-sm);
  font-family: inherit;
  font-size: var(--fs-body);
  font-weight: var(--fw-bold);
  cursor: pointer;
  transition: transform var(--dur-press);
  background: ${({ $selected }) => ($selected ? 'var(--surface)' : 'transparent')};
  color: ${({ $selected }) => ($selected ? 'var(--ink)' : 'var(--ink-2)')};
  box-shadow: ${({ $selected }) => ($selected ? 'var(--shadow-card)' : 'none')};

  &:active {
    transform: scale(0.98);
  }
`

/** A segmented control: a track of buttons, exactly one pressed at a time. */
export function Segmented({
  options,
  value,
  onChange,
  ariaLabel,
}: SegmentedProps): JSX.Element {
  return (
    <Track role="group" aria-label={ariaLabel}>
      {options.map((opt) => {
        const selected = opt.value === value
        return (
          <Segment
            key={opt.value}
            type="button"
            $selected={selected}
            aria-pressed={selected}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </Segment>
        )
      })}
    </Track>
  )
}

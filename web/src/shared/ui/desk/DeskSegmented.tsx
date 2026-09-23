import styled from 'styled-components'

/** One selectable segment: a stable `value` and its visible `label`. */
export interface DeskSegmentOption {
  /** The value emitted when this segment is chosen. */
  value: string
  /** Visible segment label. */
  label: string
}

/** Props for the {@link DeskSegmented} — a compact desktop segmented control (controlled). */
export interface DeskSegmentedProps {
  /** The selectable segments, rendered left to right. */
  options: DeskSegmentOption[]
  /** The currently selected value. */
  value: string
  /** Called with the chosen value when a segment is pressed. */
  onChange: (v: string) => void
  /** Accessible name for the control group. */
  ariaLabel: string
}

const Track = styled.div`
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  border-radius: var(--r-sm);
  background: var(--surface-2);
`

const Segment = styled.button<{ $selected: boolean }>`
  height: 30px;
  padding: 0 14px;
  border: none;
  border-radius: 6px;
  font-family: inherit;
  font-size: var(--fs-label);
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

/** A compact desktop segmented control: a track of buttons, exactly one pressed at a time. */
export function DeskSegmented({
  options,
  value,
  onChange,
  ariaLabel,
}: DeskSegmentedProps): JSX.Element {
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

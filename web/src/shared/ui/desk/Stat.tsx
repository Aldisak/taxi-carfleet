import { type ReactNode } from 'react'
import styled from 'styled-components'
import { Icon } from '../icons/Icon'

/** Direction of a {@link Stat} delta, driving colour and the arrow glyph. */
export type StatDeltaDirection = 'up' | 'down' | 'flat'

/** A KPI delta: a formatted value plus a direction. */
export interface StatDelta {
  /** Pre-formatted delta text (e.g. `"+12 %"`). */
  value: ReactNode
  /** Whether the metric moved up, down, or stayed flat. */
  direction: StatDeltaDirection
}

/** Props for the {@link Stat} KPI card. */
export interface StatProps {
  /** Metric label (12/700). */
  label: string
  /** Formatted metric value (26/800). */
  value: ReactNode
  /** Optional trend delta with a coloured arrow. */
  delta?: StatDelta
}

const Card = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 16px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
`

const Label = styled.span`
  font-size: var(--fs-caption);
  font-weight: var(--fw-bold);
  color: var(--ink-2);
`

const Value = styled.span`
  font-size: 26px;
  font-weight: var(--fw-extra);
  color: var(--ink);
  line-height: 1.1;
`

const Delta = styled.span<{ $direction: StatDeltaDirection }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--fs-caption);
  font-weight: var(--fw-bold);
  color: ${({ $direction }) =>
    $direction === 'up'
      ? 'var(--success)'
      : $direction === 'down'
        ? 'var(--danger)'
        : 'var(--ink-2)'};
`

/** A KPI card: label, large value, and an optional coloured trend delta. */
export function Stat({ label, value, delta }: StatProps): JSX.Element {
  return (
    <Card>
      <Label>{label}</Label>
      <Value>{value}</Value>
      {delta !== undefined && (
        <Delta $direction={delta.direction}>
          {delta.direction === 'up' && <Icon name="arrow-up" size={14} />}
          {delta.direction === 'down' && <Icon name="arrow-down" size={14} />}
          <span>{delta.value}</span>
        </Delta>
      )}
    </Card>
  )
}

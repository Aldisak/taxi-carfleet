import { type ReactNode } from 'react'
import styled from 'styled-components'

/** Semantic tone of the {@link Pill}. */
export type PillTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent'

/** Props for the shared {@link Pill}, a small non-interactive status badge. */
export interface PillProps {
  /** Semantic tone driving the colour pair. Defaults to `'neutral'`. */
  tone?: PillTone
  /** The pill content (short status text). */
  children: ReactNode
}

const StyledPill = styled.span<{ $tone: PillTone }>`
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 10px;
  border-radius: var(--r-pill);
  font-size: var(--fs-caption);
  font-weight: var(--fw-extra);
  text-transform: uppercase;
  white-space: nowrap;

  ${({ $tone }) => {
    switch ($tone) {
      case 'success':
        return `background: var(--success-bg); color: var(--success);`
      case 'warning':
        return `background: var(--warning-bg); color: var(--warning);`
      case 'danger':
        return `background: var(--danger-bg); color: var(--danger);`
      case 'info':
        return `background: var(--info-bg); color: var(--info);`
      case 'accent':
        return `background: var(--accent); color: var(--on-accent);`
      case 'neutral':
      default:
        return `background: var(--surface-2); color: var(--ink-2);`
    }
  }}
`

/** A small uppercase status pill. Non-interactive. */
export function Pill({ tone = 'neutral', children }: PillProps): JSX.Element {
  return <StyledPill $tone={tone}>{children}</StyledPill>
}

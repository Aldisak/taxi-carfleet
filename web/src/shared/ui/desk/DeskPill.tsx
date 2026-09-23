import { type ReactNode } from 'react'
import styled from 'styled-components'

/** Semantic tone of the {@link DeskPill} (mirrors the mobile `PillTone` union). */
export type DeskPillTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent'

/** Props for the {@link DeskPill} — a compact desktop status badge (non-interactive). */
export interface DeskPillProps {
  /** Semantic tone driving the colour pair. Defaults to `'neutral'`. */
  tone?: DeskPillTone
  /** The pill content (short status text). */
  children: ReactNode
}

const StyledPill = styled.span<{ $tone: DeskPillTone }>`
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 8px;
  border-radius: var(--r-pill);
  font-size: 11px;
  font-weight: var(--fw-extra);
  letter-spacing: 0.02em;
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

/** A compact (22px) uppercase status pill for the desktop kit. Non-interactive. */
export function DeskPill({ tone = 'neutral', children }: DeskPillProps): JSX.Element {
  return <StyledPill $tone={tone}>{children}</StyledPill>
}

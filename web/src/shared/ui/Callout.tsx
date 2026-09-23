import { type ReactNode } from 'react'
import styled from 'styled-components'

/** Semantic tone of the {@link Callout}. */
export type CalloutTone = 'neutral' | 'warning' | 'danger' | 'info'

/** Props for the shared {@link Callout}, an inline informational box. */
export interface CalloutProps {
  /** Semantic tone driving the colour pair. Defaults to `'neutral'`. */
  tone?: CalloutTone
  /** The callout body (already-translated text or elements). */
  children: ReactNode
  /** Optional leading icon (a `ReactNode` slot — pass an `<Icon>` element). */
  icon?: ReactNode
  /**
   * Optional ARIA role passthrough. Defaults to `undefined` (no role); the
   * consumer sets `role="alert"` for danger/urgent cases.
   */
  role?: string
}

const StyledCallout = styled.div<{ $tone: CalloutTone }>`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  border-radius: var(--r-md);
  font-size: var(--fs-body);
  font-weight: var(--fw-regular);

  ${({ $tone }) => {
    switch ($tone) {
      case 'warning':
        return `background: var(--warning-bg); color: var(--warning);`
      case 'danger':
        return `background: var(--danger-bg); color: var(--danger);`
      case 'info':
        return `background: var(--info-bg); color: var(--info);`
      case 'neutral':
      default:
        return `background: var(--surface-2); color: var(--ink-2);`
    }
  }}
`

const IconSlot = styled.span`
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
`

const Body = styled.span`
  flex: 1;
  min-width: 0;
`

/** An inline informational box with an optional leading icon. Presentational. */
export function Callout({ tone = 'neutral', children, icon, role }: CalloutProps): JSX.Element {
  return (
    <StyledCallout $tone={tone} data-tone={tone} role={role}>
      {icon !== undefined && icon !== null ? <IconSlot>{icon}</IconSlot> : null}
      <Body>{children}</Body>
    </StyledCallout>
  )
}

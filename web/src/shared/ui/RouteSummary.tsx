import { type ReactNode } from 'react'
import styled from 'styled-components'

/** Props for the shared {@link RouteSummary}, a pickup→dropoff summary block. */
export interface RouteSummaryProps {
  /** The pickup (origin) address line. */
  pickup: string
  /** The dropoff (destination) address line. Omit for pickup-only summaries. */
  dropoff?: string
  /** Optional meta line under the addresses (e.g. "Hned · 1 cestující · 100 Kč"). */
  meta?: ReactNode
  /** Optional trailing action slot (e.g. an "Upravit" button passed in by the consumer). */
  action?: ReactNode
}

const Root = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 12px;
`

const Markers = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: none;
  padding-top: 6px;
`

const Dot = styled.span`
  width: 10px;
  height: 10px;
  border-radius: var(--r-pill);
  background: var(--accent);
`

const Connector = styled.span`
  width: 2px;
  flex: 1;
  min-height: 20px;
  margin: 4px 0;
  background: var(--line-strong);
`

const Square = styled.span`
  width: 10px;
  height: 10px;
  border-radius: 2px;
  background: var(--ink);
`

const Body = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  flex: 1;
`

const Address = styled.span`
  font-size: var(--fs-body-lg);
  color: var(--ink);
`

const Meta = styled.div`
  font-size: var(--fs-caption);
  color: var(--ink-2);
`

const Action = styled.div`
  flex: none;
`

/** A pickup→dropoff summary: an accent dot linked by a connector to an ink square, then addresses. */
export function RouteSummary({ pickup, dropoff, meta, action }: RouteSummaryProps): JSX.Element {
  return (
    <Root>
      <Markers aria-hidden="true">
        <Dot />
        {dropoff ? (
          <>
            <Connector />
            <Square />
          </>
        ) : null}
      </Markers>
      <Body>
        <Address>{pickup}</Address>
        {dropoff ? <Address>{dropoff}</Address> : null}
        {meta ? <Meta>{meta}</Meta> : null}
      </Body>
      {action ? <Action>{action}</Action> : null}
    </Root>
  )
}

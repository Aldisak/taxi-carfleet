import { type ReactNode } from 'react'
import styled from 'styled-components'

/** Visual tone of the {@link PriceCard}. */
export type PriceCardTone = 'neutral' | 'warning'

/** Props for the shared {@link PriceCard}, a large price display card. */
export interface PriceCardProps {
  /** The already-formatted price (e.g. "100 Kč"). Rendered at display size. */
  price: ReactNode
  /** Optional price-type slot (e.g. a `<Pill>` reading "Pevná cena"). */
  type?: ReactNode
  /** Optional single-line note under the price (e.g. an estimate disclaimer). */
  note?: string
  /** Colour tone. `'warning'` tints the card for orientation-estimate prices. Defaults to `'neutral'`. */
  tone?: PriceCardTone
}

const Card = styled.div<{ $tone: PriceCardTone }>`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 20px;
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-card);
  background: ${({ $tone }) => ($tone === 'warning' ? 'var(--warning-bg)' : 'var(--surface)')};
`

const Head = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`

const Price = styled.span`
  font-size: var(--fs-display);
  font-weight: var(--fw-extra);
  color: var(--ink);
`

const Note = styled.span`
  font-size: var(--fs-caption);
  color: var(--ink-2);
`

/** A large price display card with an optional type pill and note; neutral or warning-tinted. */
export function PriceCard({ price, type, note, tone = 'neutral' }: PriceCardProps): JSX.Element {
  return (
    <Card $tone={tone}>
      <Head>
        <Price>{price}</Price>
        {type}
      </Head>
      {note ? <Note>{note}</Note> : null}
    </Card>
  )
}

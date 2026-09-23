import { type ReactNode } from 'react'
import styled from 'styled-components'

/** Size of the {@link Plate}. */
export type PlateSize = 'md' | 'lg'

/** Props for the shared {@link Plate}, a license-plate (SPZ) display. Non-interactive. */
export interface PlateProps {
  /** The plate string to display. */
  children: ReactNode
  /** Size preset. `'md'` is compact, `'lg'` is prominent. Defaults to `'md'`. */
  size?: PlateSize
}

const StyledPlate = styled.span<{ $size: PlateSize }>`
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--line-strong);
  border-radius: var(--r-sm);
  background: var(--surface);
  color: var(--ink);
  letter-spacing: 0.08em;
  font-weight: var(--fw-extra);
  white-space: nowrap;

  ${({ $size }) =>
    $size === 'lg'
      ? `
        height: 48px;
        padding: 0 14px;
        font-size: var(--fs-title);
      `
      : `
        height: 24px;
        padding: 0 8px;
        font-size: var(--fs-body-lg);
      `}
`

/** A license-plate (SPZ) display badge. Non-interactive. */
export function Plate({ children, size = 'md' }: PlateProps): JSX.Element {
  return <StyledPlate $size={size}>{children}</StyledPlate>
}

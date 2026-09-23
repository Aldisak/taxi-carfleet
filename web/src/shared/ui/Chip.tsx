import { type ButtonHTMLAttributes, type ReactNode } from 'react'
import styled from 'styled-components'

/** Props for the shared {@link Chip}, a selectable option pill. Extends native `<button>` attributes. */
export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Whether the chip is currently selected. Drives `aria-pressed` and the on/off styling. */
  selected?: boolean
  /** The chip content (option label). */
  children: ReactNode
}

const StyledChip = styled.button<{ $on: boolean }>`
  display: inline-flex;
  align-items: center;
  height: 40px;
  padding: 0 16px;
  border-radius: var(--r-pill);
  font-family: inherit;
  font-size: var(--fs-label);
  font-weight: var(--fw-bold);
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition: transform var(--dur-press);

  ${({ $on }) =>
    $on
      ? `
        background: transparent;
        color: var(--accent-text);
        border: 1px solid var(--accent);
      `
      : `
        background: var(--surface-2);
        color: var(--ink);
        border: 1px solid var(--line);
      `}

  &:active {
    transform: scale(0.98);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
`

/** A selectable option pill rendered as a toggle `<button>` with `aria-pressed`. */
export function Chip({
  selected = false,
  children,
  type = 'button',
  ...rest
}: ChipProps): JSX.Element {
  return (
    <StyledChip type={type} $on={selected} aria-pressed={selected} {...rest}>
      {children}
    </StyledChip>
  )
}

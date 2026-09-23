import { type ButtonHTMLAttributes, type ReactNode } from 'react'
import styled from 'styled-components'

/** Props for the {@link FilterChip} — a 36px toggle filter chip. Extends native `<button>`. */
export interface FilterChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Whether the chip is on. Drives `aria-pressed` and the on/off styling. */
  selected?: boolean
  /** The chip label. */
  children: ReactNode
}

const StyledChip = styled.button<{ $on: boolean }>`
  display: inline-flex;
  align-items: center;
  height: 36px;
  padding: 0 14px;
  border-radius: var(--r-sm);
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
        background: var(--surface);
        color: var(--ink);
        border: 1px solid var(--ink);
      `
      : `
        background: var(--surface-2);
        color: var(--ink-2);
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

/** A 36px filter chip rendered as a toggle `<button>` with `aria-pressed`. */
export function FilterChip({
  selected = false,
  children,
  type = 'button',
  ...rest
}: FilterChipProps): JSX.Element {
  return (
    <StyledChip type={type} $on={selected} aria-pressed={selected} {...rest}>
      {children}
    </StyledChip>
  )
}

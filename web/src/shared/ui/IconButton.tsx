import { type ButtonHTMLAttributes, type ReactNode } from 'react'
import styled from 'styled-components'

/** Visual variant of the {@link IconButton}. */
export type IconButtonVariant = 'default' | 'accent'

/** Props for the shared {@link IconButton}. Extends native `<button>` attributes. */
export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  /** The icon to render (a `ReactNode` slot — pass an `<Icon>` element). */
  icon: ReactNode
  /** Accessible name; becomes the button's `aria-label`. Required. */
  label: string
  /** Visual variant. Defaults to `'default'`. */
  variant?: IconButtonVariant
}

const StyledIconButton = styled.button<{ $variant: IconButtonVariant }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  padding: 0;
  border: none;
  border-radius: var(--r-pill);
  cursor: pointer;
  transition: transform var(--dur-press);

  ${({ $variant }) =>
    $variant === 'accent'
      ? `
        background: var(--accent);
        color: var(--on-accent);
      `
      : `
        background: var(--surface);
        color: var(--ink);
        box-shadow: var(--shadow-card);
      `}

  &:active {
    transform: scale(0.98);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
`

/** A 48px round icon-only button with a required accessible name. */
export function IconButton({
  icon,
  label,
  variant = 'default',
  type = 'button',
  ...rest
}: IconButtonProps): JSX.Element {
  return (
    <StyledIconButton type={type} $variant={variant} aria-label={label} {...rest}>
      {icon}
    </StyledIconButton>
  )
}

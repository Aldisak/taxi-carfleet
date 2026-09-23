import { type ButtonHTMLAttributes, type ReactNode } from 'react'
import styled from 'styled-components'

/** Visual variant of the button. */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dangerGhost'

/** Size of the button (drives min-height). */
export type ButtonSize = 'md' | 'sm'

/** Props for the shared {@link Button}. Extends native `<button>` attributes. */
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** The button label (left-aligned content). */
  children: ReactNode
  /** Visual variant. Defaults to `'primary'`. */
  variant?: ButtonVariant
  /** Size preset. `'md'` is 56px min-height, `'sm'` is 44px. Defaults to `'md'`. */
  size?: ButtonSize
  /** Optional right-aligned price slot, e.g. `"100 Kč"`. When present the label and price sit at opposite ends. */
  price?: ReactNode
  /** When true the button is disabled and shows {@link loadingLabel} plus a spinner. */
  loading?: boolean
  /** Text shown in place of {@link children} while {@link loading}. */
  loadingLabel?: string
  /** When true the button stretches to `width: 100%`. */
  fullWidth?: boolean
}

const StyledButton = styled.button<{
  $variant: ButtonVariant
  $size: ButtonSize
  $fullWidth: boolean
  $hasPrice: boolean
}>`
  display: inline-flex;
  align-items: center;
  justify-content: ${({ $hasPrice }) => ($hasPrice ? 'space-between' : 'center')};
  gap: 8px;
  min-height: ${({ $size }) => ($size === 'sm' ? '44px' : '56px')};
  width: ${({ $fullWidth }) => ($fullWidth ? '100%' : 'auto')};
  padding: 0 20px;
  border: none;
  border-radius: var(--r-md);
  font-family: inherit;
  font-size: var(--fs-body-lg);
  font-weight: var(--fw-extra);
  line-height: 1;
  cursor: pointer;
  transition: transform var(--dur-press);

  ${({ $variant }) => {
    switch ($variant) {
      case 'secondary':
        return `
          background: var(--surface);
          color: var(--ink);
          border: 1px solid var(--line);
        `
      case 'ghost':
        return `
          background: transparent;
          color: var(--accent-text);
        `
      case 'danger':
        return `
          background: var(--danger);
          color: #fff;
        `
      case 'dangerGhost':
        return `
          background: transparent;
          color: var(--danger);
        `
      case 'primary':
      default:
        return `
          background: var(--accent);
          color: var(--on-accent);
        `
    }
  }}

  &:active {
    transform: scale(0.98);
  }

  &:disabled {
    cursor: not-allowed;
    ${({ $variant }) =>
      $variant === 'ghost' || $variant === 'dangerGhost'
        ? `opacity: 0.5;`
        : `
          background: var(--surface-3);
          color: var(--ink-3);
          border-color: var(--line);
        `}
  }
`

const Spinner = styled.span`
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: var(--r-pill);
  animation: button-spin 0.7s linear infinite;

  @keyframes button-spin {
    to {
      transform: rotate(360deg);
    }
  }
`

const Price = styled.span`
  font-weight: var(--fw-extra);
`

/** A primary/secondary/ghost/danger action button with an optional price slot and loading state. */
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  price,
  loading = false,
  loadingLabel,
  fullWidth = false,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps): JSX.Element {
  const isDisabled = disabled === true || loading
  const hasPrice = price !== undefined && !loading

  return (
    <StyledButton
      type={type}
      $variant={variant}
      $size={size}
      $fullWidth={fullWidth}
      $hasPrice={hasPrice}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <>
          <Spinner aria-hidden="true" />
          <span>{loadingLabel}</span>
        </>
      ) : (
        <>
          <span>{children}</span>
          {price !== undefined && <Price>{price}</Price>}
        </>
      )}
    </StyledButton>
  )
}

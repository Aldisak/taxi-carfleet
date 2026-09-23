import { type ButtonHTMLAttributes, type ReactNode } from 'react'
import styled from 'styled-components'

/** Visual variant of the {@link DeskButton}. */
export type DeskButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger'

/** Size preset of the {@link DeskButton} (drives height). */
export type DeskButtonSize = 'md' | 'xs'

/** Props for the {@link DeskButton}. Extends native `<button>` attributes. */
export interface DeskButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** The button label. */
  children: ReactNode
  /** Visual variant. Defaults to `'primary'`. */
  variant?: DeskButtonVariant
  /** Size preset. `'md'` is 40px, `'xs'` is 32px. Defaults to `'md'`. */
  size?: DeskButtonSize
  /** When true the button is disabled and shows {@link loadingLabel} plus a spinner. */
  loading?: boolean
  /** Text shown in place of {@link children} while {@link loading}. */
  loadingLabel?: string
}

const StyledButton = styled.button<{ $variant: DeskButtonVariant; $size: DeskButtonSize }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: ${({ $size }) => ($size === 'xs' ? '32px' : '40px')};
  padding: 0 ${({ $size }) => ($size === 'xs' ? '12px' : '16px')};
  border: 1px solid transparent;
  border-radius: var(--r-sm);
  font-family: inherit;
  font-size: ${({ $size }) => ($size === 'xs' ? 'var(--fs-caption)' : 'var(--fs-label)')};
  font-weight: var(--fw-bold);
  line-height: 1;
  cursor: pointer;
  transition: transform var(--dur-press);

  ${({ $variant }) => {
    switch ($variant) {
      case 'secondary':
        return `
          background: var(--surface);
          color: var(--ink);
          border-color: var(--line);
        `
      case 'outline':
        return `
          background: transparent;
          color: var(--ink);
          border-color: var(--line-strong);
        `
      case 'danger':
        return `
          background: transparent;
          color: var(--danger);
          border-color: transparent;
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
    opacity: 0.55;
  }
`

const Spinner = styled.span`
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: var(--r-pill);
  animation: desk-button-spin 0.7s linear infinite;

  @keyframes desk-button-spin {
    to {
      transform: rotate(360deg);
    }
  }
`

/** A desktop action button: md/xs sizes, primary/secondary/outline/danger variants, loading state. */
export function DeskButton({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  loadingLabel,
  disabled,
  type = 'button',
  ...rest
}: DeskButtonProps): JSX.Element {
  const isDisabled = disabled === true || loading

  return (
    <StyledButton
      type={type}
      $variant={variant}
      $size={size}
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
        children
      )}
    </StyledButton>
  )
}

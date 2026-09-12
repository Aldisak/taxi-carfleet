import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import type { ButtonVariant } from './homeState'

interface ButtonProps {
  $variant: ButtonVariant
}

const Btn = styled.button<ButtonProps>`
  width: 100%;
  min-height: ${({ theme }) => theme.touchTargets.primary};
  padding: 0 ${({ theme }) => theme.spacing.xl};
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  font-size: ${({ theme }) => theme.typography.fontSizeLg};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  cursor: pointer;
  transition: opacity 0.15s ease;

  background: ${({ $variant, theme }) =>
    $variant === 'primary'
      ? theme.colors.success
      : $variant === 'secondary'
        ? theme.colors.primary
        : theme.colors.error};
  color: #ffffff;

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  &:active:not(:disabled) {
    opacity: 0.85;
  }
`

const Hint = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.textSecondary};
  text-align: center;
  margin: ${({ theme }) => theme.spacing.xs} 0 0 0;
`

interface StatusButtonProps {
  labelKey: string
  variant: ButtonVariant
  disabled: boolean
  disabledHint?: string | null
  isPending?: boolean
  onClick: () => void
}

/**
 * Giant primary action button for the driver home screen.
 * Minimum touch target: 64 px (theme.touchTargets.primary).
 */
export function StatusButton({
  labelKey,
  variant,
  disabled,
  disabledHint,
  isPending = false,
  onClick,
}: StatusButtonProps) {
  const { t } = useTranslation()

  return (
    <>
      <Btn
        $variant={variant}
        disabled={disabled || isPending}
        onClick={onClick}
        type="button"
      >
        {t(labelKey)}
      </Btn>
      {disabledHint && !isPending && (
        <Hint>{t(disabledHint)}</Hint>
      )}
    </>
  )
}

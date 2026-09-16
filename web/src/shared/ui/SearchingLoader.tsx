import styled, { keyframes } from 'styled-components'
import { useTranslation } from 'react-i18next'

const spin = keyframes`
  to {
    transform: rotate(360deg);
  }
`

const Wrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
`

const Spinner = styled.span`
  width: ${({ theme }) => theme.spacing.md};
  height: ${({ theme }) => theme.spacing.md};
  border: 2px solid ${({ theme }) => theme.colors.border};
  border-top-color: ${({ theme }) => theme.colors.primary};
  border-radius: ${({ theme }) => theme.borderRadius.full};
  animation: ${spin} 0.9s linear infinite;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

/** Props for the shared searching/loading indicator. */
export interface SearchingLoaderProps {
  /** i18n key for the visible status label; defaults to the customer searching text. */
  labelKey?: string
}

/**
 * Animated searching indicator (shared/ui — reused by UC-016 live-ride search-for-driver).
 * role=status with a visible i18n label, mirroring the MapyMap LoadingState placeholder.
 * The spin animation respects prefers-reduced-motion (no animation when reduced).
 */
export function SearchingLoader({
  labelKey = 'customer.loader.searching',
}: SearchingLoaderProps) {
  const { t } = useTranslation()

  return (
    <Wrapper role="status">
      <Spinner aria-hidden="true" />
      {t(labelKey)}
    </Wrapper>
  )
}

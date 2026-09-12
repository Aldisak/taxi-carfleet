import type { ReactNode } from 'react'
import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { CallButton } from './CallButton'
import { useOnlineStatus } from './useOnlineStatus'

const Banner = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.lg};
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.warning};
  border-radius: ${({ theme }) => theme.borderRadius.md};
`

const Title = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.typography.fontSizeLg};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  color: ${({ theme }) => theme.colors.text};
`

const Detail = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  color: ${({ theme }) => theme.colors.textSecondary};
`

/** Props for OfflineGate. */
export interface OfflineGateProps {
  /** Fleet phone shown in the offline banner's call action. */
  phone: string | null | undefined
  /** Ordering UI rendered while online. */
  children: ReactNode
}

/**
 * Gates mutating order actions on connectivity. While online, renders its children
 * (ordering). While offline, replaces them with a role="alert" banner carrying the
 * Czech "Jste offline – zavolejte nám" message and the Zavolat button, so the phone
 * fallback always works (spec §Behavior rules). Reads stay served from cache elsewhere.
 */
export function OfflineGate({ phone, children }: OfflineGateProps) {
  const { t } = useTranslation()
  const online = useOnlineStatus()

  if (online) {
    return <>{children}</>
  }

  return (
    <Banner role="alert" aria-live="polite">
      <Title>{t('customer.offline.title')}</Title>
      <Detail>{t('customer.offline.orderingDisabled')}</Detail>
      <CallButton phone={phone} />
    </Banner>
  )
}

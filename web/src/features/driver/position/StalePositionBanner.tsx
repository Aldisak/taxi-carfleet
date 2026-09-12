import styled from 'styled-components'
import { useTranslation } from 'react-i18next'

const Banner = styled.div`
  background: ${({ theme }) => theme.colors.error};
  color: ${({ theme }) => theme.colors.statusOfflineText};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.md};
  text-align: center;
`

/**
 * Red banner shown when the driver's position has not been successfully sent for >= 60s
 * while online (usePositionReporting.stale). Renders nothing otherwise.
 */
export function StalePositionBanner({ stale }: { stale: boolean }) {
  const { t } = useTranslation()
  if (!stale) return null
  return (
    <Banner role="alert" aria-live="polite">
      {t('driver.position.stale')}
    </Banner>
  )
}

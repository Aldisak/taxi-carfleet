import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { useGeoUsage } from './useGeoUsage'

const Panel = styled.section`
  padding: ${({ theme }) => theme.spacing.md};
  max-width: 520px;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
`

const Title = styled.h3`
  font-size: ${({ theme }) => theme.typography.fontSizeLg};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  margin: 0;
`

const Row = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: ${({ theme }) => theme.spacing.md};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
`

const RowLabel = styled.span`
  color: ${({ theme }) => theme.colors.textSecondary};
`

const RowValue = styled.span`
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  color: ${({ theme }) => theme.colors.text};
`

// Progress bar of usage vs budget. The fill turns to the warning/error tone as usage climbs so a
// FleetAdmin sees an over-budget month at a glance (rules/web-accessibility.md#semantics — the
// numeric percent below carries the real value; the bar is a decorative affordance).
const Bar = styled.div`
  height: 8px;
  border-radius: ${({ theme }) => theme.borderRadius.full};
  background: ${({ theme }) => theme.colors.border};
  overflow: hidden;
`

const BarFill = styled.div<{ $percent: number; $over: boolean }>`
  height: 100%;
  width: ${({ $percent }) => Math.min($percent, 100)}%;
  background: ${({ theme, $over, $percent }) =>
    $over ? theme.colors.error : $percent >= 80 ? theme.colors.warning : theme.colors.primary};
`

const Percent = styled.p<{ $over: boolean }>`
  margin: 0;
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  color: ${({ theme, $over }) => ($over ? theme.colors.error : theme.colors.text)};
`

const Muted = styled.p`
  margin: 0;
  padding: ${({ theme }) => theme.spacing.md};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
`

/** Format a credit count for display (cs-CZ thousands separators, no decimals). */
function formatCredits(credits: number): string {
  return new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 }).format(credits)
}

/**
 * Settings panel showing this fleet's month-to-date geo API credit consumption and its monthly
 * budget as a percentage (UC-010 AC#6 / WI-17). Reads GET settings/geo-usage via useGeoUsage.
 * FleetAdmin-only surface — access is already gated by SettingsPage/canAccessSettings, so the
 * panel itself does no role check. Rendered inside FleetTab.
 */
export function GeoUsagePanel() {
  const { t } = useTranslation()
  const { data, isLoading, isError } = useGeoUsage()

  if (isLoading) {
    return <Muted role="status">{t('settings.geoUsage.loading')}</Muted>
  }

  if (isError || !data) {
    return <Muted role="alert">{t('settings.geoUsage.error')}</Muted>
  }

  const over = data.usagePercent > 100
  const percentLabel = t('settings.geoUsage.percent', {
    percent: new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 1 }).format(data.usagePercent),
  })

  return (
    <Panel aria-label={t('settings.geoUsage.title')}>
      <Title>{t('settings.geoUsage.title')}</Title>

      <Row>
        <RowLabel>{t('settings.geoUsage.creditsUsed')}</RowLabel>
        <RowValue>{formatCredits(data.creditsUsedThisMonth)}</RowValue>
      </Row>

      <Row>
        <RowLabel>{t('settings.geoUsage.budget')}</RowLabel>
        <RowValue>{formatCredits(data.creditBudget)}</RowValue>
      </Row>

      <Bar aria-hidden="true">
        <BarFill $percent={data.usagePercent} $over={over} />
      </Bar>

      <Percent $over={over}>
        {percentLabel}
        {over && ` · ${t('settings.geoUsage.overBudget')}`}
      </Percent>
    </Panel>
  )
}

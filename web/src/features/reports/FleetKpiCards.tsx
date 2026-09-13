import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { formatCzk } from '../../shared/format/money'
import type { FleetKpiDto } from '../../shared/api/client'

const Grid = styled.dl`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: ${({ theme }) => theme.spacing.md};
  margin: 0;
`

const Card = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  padding: ${({ theme }) => theme.spacing.md};
`

const Label = styled.dt`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.fontSizeXs};
  margin-bottom: ${({ theme }) => theme.spacing.xs};
`

const Value = styled.dd`
  color: ${({ theme }) => theme.colors.text};
  font-size: ${({ theme }) => theme.typography.fontSizeXl};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  margin: 0;
`

/** Placeholder for a missing/undefined value. */
const DASH = '—'

/** Formats a nullable second count as "Xm Ys" (Czech-neutral, digits only); '—' when null. */
function formatDuration(seconds: number | null): string {
  if (seconds == null) return DASH
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return m > 0 ? `${m} min ${s} s` : `${s} s`
}

/** Formats a 0..1 fraction as a whole-number percentage. */
function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)} %`
}

/**
 * Formats a client-derived share (numerator/denominator) as a percentage, guarding
 * divide-by-zero — an empty denominator renders '—' rather than NaN %.
 */
function formatShare(numerator: number, denominator: number): string {
  if (denominator <= 0) return DASH
  return formatPercent(numerator / denominator)
}

interface FleetKpiCardsProps {
  kpis: FleetKpiDto
}

/** Renders the fleet-report KPI cards as a definition list. */
export function FleetKpiCards({ kpis }: FleetKpiCardsProps) {
  const { t } = useTranslation()

  // app/phone/fixed-route arrive as RAW COUNTS; the displayed shares are derived here.
  const appVsPhoneDenominator = kpis.appOrders + kpis.phoneOrders

  const cards: { label: string; value: string }[] = [
    { label: t('reports.fleet.rides'), value: String(kpis.rides) },
    { label: t('reports.fleet.revenue'), value: formatCzk(kpis.revenueCzk) },
    { label: t('reports.fleet.avgPrice'), value: formatCzk(kpis.avgPriceCzk) },
    { label: t('reports.fleet.timeToAssign'), value: formatDuration(kpis.avgTimeToAssignSeconds) },
    { label: t('reports.fleet.timeToPickup'), value: formatDuration(kpis.avgTimeToPickupSeconds) },
    { label: t('reports.fleet.cancellationRate'), value: formatPercent(kpis.cancellationRate) },
    { label: t('reports.fleet.appShare'), value: formatShare(kpis.appOrders, appVsPhoneDenominator) },
    { label: t('reports.fleet.fixedRouteShare'), value: formatShare(kpis.fixedRouteOrders, kpis.rides) },
    { label: t('reports.fleet.smsCount'), value: String(kpis.smsCount) },
    { label: t('reports.fleet.smsCost'), value: formatCzk(kpis.smsCostCzk) },
  ]

  return (
    <Grid>
      {cards.map(card => (
        <Card key={card.label}>
          <Label>{card.label}</Label>
          <Value>{card.value}</Value>
        </Card>
      ))}
    </Grid>
  )
}

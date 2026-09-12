import { useState } from 'react'
import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { DisconnectBanner } from '../../board/DisconnectBanner'
import { useMyOrders } from './useMyOrders'
import { computeHistoryTotals } from './historyTotals'

const Page = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 100%;
  padding: ${({ theme }) => theme.spacing.md};
  gap: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.background};
`

const Heading = styled.h1`
  font-size: ${({ theme }) => theme.typography.fontSizeXl};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  color: ${({ theme }) => theme.colors.text};
  margin: 0;
`

const DateRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
`

const DateInput = styled.input`
  min-height: ${({ theme }) => theme.touchTargets.min};
  flex: 1;
  padding: 0 ${({ theme }) => theme.spacing.md};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
`

const TotalsGrid = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
`

const TotalChip = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: ${({ theme }) => theme.spacing.sm};
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
`

const ChipValue = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSizeLg};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  color: ${({ theme }) => theme.colors.text};
`

const ChipLabel = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSizeXs};
  color: ${({ theme }) => theme.colors.textSecondary};
`

const List = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
`

const RideItem = styled.li`
  display: flex;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
`

const RideInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
  min-width: 0;
`

const RideAddress = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  color: ${({ theme }) => theme.colors.text};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const RideMeta = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.textSecondary};
`

const RidePrice = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSizeLg};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  color: ${({ theme }) => theme.colors.text};
  white-space: nowrap;
`

const Empty = styled.p`
  text-align: center;
  color: ${({ theme }) => theme.colors.textSecondary};
  padding: ${({ theme }) => theme.spacing.lg};
`

const czk = new Intl.NumberFormat('cs-CZ')

/** Formats an integer-CZK amount for display (no decimals, cs-CZ grouping). */
function formatCzk(amount: number): string {
  return `${czk.format(amount)} Kč`
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('cs-CZ', {
    timeZone: 'Europe/Prague',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Today's calendar date in YYYY-MM-DD (Europe/Prague), for the date input default. */
function todayPragueIso(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Prague',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  return parts
}

/**
 * Read-only ride history (spec §6): today by default, previous days selectable.
 * Renders the ride list + per-payment totals from GET /drivers/me/orders.
 * Offline keeps the last known data and shows the shared SignalR disconnect banner.
 */
export function HistoryPage() {
  const { t } = useTranslation()
  const [date, setDate] = useState<string>(() => todayPragueIso())

  const { data: orders, isLoading } = useMyOrders(date)
  const list = orders ?? []
  const totals = computeHistoryTotals(list)

  return (
    <Page>
      <DisconnectBanner />
      <Heading>{t('driver.history.title')}</Heading>

      <DateRow>
        <label htmlFor="history-date">{t('driver.history.dateLabel')}</label>
        <DateInput
          id="history-date"
          type="date"
          value={date}
          max={todayPragueIso()}
          onChange={e => setDate(e.target.value)}
        />
      </DateRow>

      <TotalsGrid aria-label={t('driver.history.totalsTitle')}>
        <TotalChip>
          <ChipValue>{totals.ridesCount}</ChipValue>
          <ChipLabel>{t('driver.history.ridesCount')}</ChipLabel>
        </TotalChip>
        <TotalChip>
          <ChipValue>{formatCzk(totals.cashTotalCzk)}</ChipValue>
          <ChipLabel>{t('driver.history.cashTotal')}</ChipLabel>
        </TotalChip>
        <TotalChip>
          <ChipValue>{formatCzk(totals.cardTotalCzk)}</ChipValue>
          <ChipLabel>{t('driver.history.cardTotal')}</ChipLabel>
        </TotalChip>
        <TotalChip>
          <ChipValue>{formatCzk(totals.invoiceTotalCzk)}</ChipValue>
          <ChipLabel>{t('driver.history.invoiceTotal')}</ChipLabel>
        </TotalChip>
      </TotalsGrid>

      {isLoading && <Empty>{t('driver.history.loading')}</Empty>}

      {!isLoading && list.length === 0 && <Empty>{t('driver.history.empty')}</Empty>}

      {list.length > 0 && (
        <List aria-label={t('driver.history.title')}>
          {list.map(ride => {
            const completed = ride.status === 'Completed'
            return (
              <RideItem key={ride.id}>
                <RideInfo>
                  <RideAddress>
                    {ride.pickupAddress}
                    {ride.dropoffAddress ? ` → ${ride.dropoffAddress}` : ''}
                  </RideAddress>
                  <RideMeta>
                    {completed
                      ? `${ride.completedAt ? formatTime(ride.completedAt) : ''}${
                          ride.paymentType
                            ? ` · ${t(`driver.history.payment.${ride.paymentType}`)}`
                            : ''
                        }`
                      : t('driver.history.active')}
                  </RideMeta>
                </RideInfo>
                <RidePrice>
                  {completed && ride.finalPriceCzk != null ? formatCzk(ride.finalPriceCzk) : '—'}
                </RidePrice>
              </RideItem>
            )
          })}
        </List>
      )}
    </Page>
  )
}

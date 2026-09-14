import styled from 'styled-components'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { MyOrderHistoryItemDto } from '../../../shared/api/client'
import { formatCzk } from '../../../shared/format/money'
import { historyRowPriceCzk, historyStatusKey, historyRowTimestamp } from './historyRules'
import { buildReorderDraft, REORDER_STATE_KEY } from './reorder'

const Card = styled.article`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  background: ${({ theme }) => theme.colors.surface};
`

const RowLink = styled(Link)`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
  min-height: ${({ theme }) => theme.touchTargets.min};
  text-decoration: none;
  color: inherit;
  border-radius: ${({ theme }) => theme.borderRadius.sm};

  &:focus-visible {
    outline: 3px solid ${({ theme }) => theme.colors.primary};
    outline-offset: 2px;
  }
`

const TopLine = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: ${({ theme }) => theme.spacing.md};
`

const DateText = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.textSecondary};
`

const Pill = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSizeXs};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
  color: ${({ theme }) => theme.colors.textSecondary};
`

const Route = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
  color: ${({ theme }) => theme.colors.text};
`

const Price = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  color: ${({ theme }) => theme.colors.text};
`

const ReorderButton = styled.button`
  align-self: flex-start;
  min-height: ${({ theme }) => theme.touchTargets.min};
  padding: 0 ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.primary};
  border: 1px solid ${({ theme }) => theme.colors.primary};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
  cursor: pointer;

  &:focus-visible {
    outline: 3px solid ${({ theme }) => theme.colors.primary};
    outline-offset: 2px;
  }
`

const pragueDate = new Intl.DateTimeFormat('cs-CZ', {
  timeZone: 'Europe/Prague',
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

function formatPrague(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : pragueDate.format(d)
}

interface HistoryRowProps {
  order: MyOrderHistoryItemDto
}

/**
 * One past-order row: tapping the row navigates to /customer/t/{code} (read-only tracking — the cold
 * authed load renders the by-code DTO read-only, laneB4d contract note). "Objednat znovu" copies
 * the addresses into a custom-order draft (reorder.ts) passed via router state and navigates to
 * /customer/order/new prefilled. Date in Europe/Prague, price in cs-CZ CZK.
 */
export function HistoryRow({ order }: HistoryRowProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const price = historyRowPriceCzk(order)
  const route = [order.pickupAddress, order.dropoffAddress].filter(Boolean).join(' → ')

  function handleReorder() {
    navigate('/customer/order/new', { state: { [REORDER_STATE_KEY]: buildReorderDraft(order) } })
  }

  return (
    <Card>
      <RowLink to={`/customer/t/${encodeURIComponent(order.publicCode)}`} aria-label={t('customer.history.openAria', { code: order.publicCode })}>
        <TopLine>
          <DateText>{formatPrague(historyRowTimestamp(order))}</DateText>
          <Pill>{t(historyStatusKey(order.status))}</Pill>
        </TopLine>
        <Route>{route}</Route>
        <Price>{price != null ? formatCzk(price) : t('customer.history.priceUnknown')}</Price>
      </RowLink>
      <ReorderButton type="button" onClick={handleReorder}>
        {t('customer.history.reorder')}
      </ReorderButton>
    </Card>
  )
}

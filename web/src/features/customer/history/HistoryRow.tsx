import styled from 'styled-components'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { MyOrderHistoryItemDto } from '../../../shared/api/client'
import { formatCzk } from '../../../shared/format/money'
import { Pill, RouteSummary, Button } from '../../../shared/ui'
import { historyRowPriceCzk, historyStatusKey } from './historyRules'
import { historyStatusTone } from './dayGrouping'
import { buildReorderDraft, REORDER_STATE_KEY } from './reorder'

const Card = styled.article`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border-radius: var(--r-lg);
  background: var(--surface);
  box-shadow: var(--shadow-card);
`

const RowLink = styled(Link)`
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 48px;
  text-decoration: none;
  color: inherit;
  border-radius: var(--r-md);

  &:focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }
`

const TopLine = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
`

const Price = styled.span`
  font-size: var(--fs-body-lg);
  font-weight: var(--fw-extra);
  color: var(--ink);
`

const Actions = styled.div`
  display: flex;
`

interface HistoryRowProps {
  order: MyOrderHistoryItemDto
}

/**
 * One past-order card (UC-020 WI-5 restyle onto the shared UI kit). Tapping the card navigates to
 * /customer/t/{code} (read-only tracking — the cold authed load renders the by-code DTO read-only,
 * laneB4d contract note). The status Pill tone comes from historyStatusTone; the pickup→dropoff
 * route uses the shared RouteSummary. "Objednat znovu" (a small secondary Button, a SIBLING of the
 * card link so it never nests interactive elements) starts a new order on the map-first /customer
 * surface (UC-015 replaced /customer/order/new). The reorder draft (reorder.ts) is still passed via
 * router state for forward-compat. The per-ride date lives in the day header now (design handoff §3
 * lists no per-ride time). Price in cs-CZ CZK.
 */
export function HistoryRow({ order }: HistoryRowProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const price = historyRowPriceCzk(order)

  function handleReorder() {
    navigate('/customer', { state: { [REORDER_STATE_KEY]: buildReorderDraft(order) } })
  }

  return (
    <Card>
      <RowLink
        to={`/customer/t/${encodeURIComponent(order.publicCode)}`}
        aria-label={t('customer.history.openAria', { code: order.publicCode })}
      >
        <TopLine>
          <Pill tone={historyStatusTone(order.status)}>{t(historyStatusKey(order.status))}</Pill>
          <Price>{price != null ? formatCzk(price) : t('customer.history.priceUnknown')}</Price>
        </TopLine>
        <RouteSummary pickup={order.pickupAddress} dropoff={order.dropoffAddress ?? undefined} />
      </RowLink>
      <Actions>
        <Button type="button" variant="secondary" size="sm" onClick={handleReorder}>
          {t('customer.history.reorder')}
        </Button>
      </Actions>
    </Card>
  )
}

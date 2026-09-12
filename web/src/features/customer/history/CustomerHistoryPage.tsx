import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { useOnlineStatus } from '../shell/useOnlineStatus'
import { useMyOrderHistory } from './useMyOrderHistory'
import { isHistoryEmpty } from './historyRules'
import { HistoryRow } from './HistoryRow'

const Page = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.lg};
`

const Title = styled.h1`
  margin: 0;
  font-size: ${({ theme }) => theme.typography.fontSizeLg};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  color: ${({ theme }) => theme.colors.text};
`

const Banner = styled.p`
  margin: 0;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  background: ${({ theme }) => theme.colors.background};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.textSecondary};
`

const Empty = styled.p`
  margin: ${({ theme }) => theme.spacing.xl} 0;
  text-align: center;
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  color: ${({ theme }) => theme.colors.textSecondary};
`

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`

/**
 * Customer ride history (/c/history). Read-only list of past orders from GET orders/mine
 * (A-my-orders, via useMyOrderHistory). Each row taps through to read-only tracking and offers
 * "Objednat znovu" (B-history). Offline shows the last known rows from cache plus a banner
 * (rules/web-realtime.md#last-known-state); an empty list shows "Zatím žádné jízdy". The list is
 * realistically small (a customer's own rides), so a plain map is used — no virtualization
 * (rules/web-performance.md#virtualization).
 */
export function CustomerHistoryPage() {
  const { t } = useTranslation()
  const online = useOnlineStatus()
  const { items, isLoading } = useMyOrderHistory()

  return (
    <Page>
      <Title>{t('customer.history.title')}</Title>

      {!online && <Banner role="status">{t('customer.history.offline')}</Banner>}

      {!isLoading && isHistoryEmpty(items) ? (
        <Empty>{t('customer.history.empty')}</Empty>
      ) : (
        <List>
          {items.map((order) => (
            <HistoryRow key={order.id} order={order} />
          ))}
        </List>
      )}
    </Page>
  )
}

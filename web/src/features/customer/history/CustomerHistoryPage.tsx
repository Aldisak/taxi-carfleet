import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { Callout } from '../../../shared/ui'
import { useOnlineStatus } from '../shell/useOnlineStatus'
import { useMyOrderHistory } from './useMyOrderHistory'
import { isHistoryEmpty } from './historyRules'
import { groupByPragueDay } from './dayGrouping'
import { HistoryRow } from './HistoryRow'

const Page = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 20px;
`

const Title = styled.h1`
  margin: 0;
  font-size: var(--fs-title);
  font-weight: var(--fw-extra);
  color: var(--ink);
`

const Empty = styled.p`
  margin: 48px 0;
  text-align: center;
  font-size: var(--fs-body);
  color: var(--ink-2);
`

const Groups = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
`

const Group = styled.section`
  display: flex;
  flex-direction: column;
  gap: 12px;
`

const DayHeading = styled.h2`
  margin: 0;
  font-size: var(--fs-label);
  font-weight: var(--fw-bold);
  color: var(--ink-2);
`

const Rows = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`

/**
 * Customer ride history (/customer/history), restyled onto the shared UI kit (UC-020 WI-5). Read-only
 * list of past orders from GET orders/mine (A-my-orders, via useMyOrderHistory), grouped by
 * Europe/Prague day (groupByPragueDay — presentational, pure). Each ride is a surface card offering
 * "Objednat znovu" (B-history). Offline shows the last known rows from cache plus a warning Callout
 * (rules/web-realtime.md#last-known-state); an empty list shows "Zatím žádné jízdy". The list is
 * realistically small (a customer's own rides), so a plain map is used — no virtualization
 * (rules/web-performance.md#virtualization).
 */
export function CustomerHistoryPage() {
  const { t } = useTranslation()
  const online = useOnlineStatus()
  const { items, isLoading } = useMyOrderHistory()

  const groups = groupByPragueDay(items)

  return (
    <Page>
      <Title>{t('customer.history.title')}</Title>

      {!online && (
        <Callout tone="warning" role="status">
          {t('customer.history.offline')}
        </Callout>
      )}

      {!isLoading && isHistoryEmpty(items) ? (
        <Empty>{t('customer.history.empty')}</Empty>
      ) : (
        <Groups>
          {groups.map((group) => (
            <Group key={group.key}>
              <DayHeading>{group.label}</DayHeading>
              <Rows>
                {group.items.map((order) => (
                  <HistoryRow key={order.id} order={order} />
                ))}
              </Rows>
            </Group>
          ))}
        </Groups>
      )}
    </Page>
  )
}

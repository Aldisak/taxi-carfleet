import { useState } from 'react'
import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { getOrders, getDrivers } from '../../shared/api/client'
import type { OrderSummaryDto } from '../../shared/api/client'
import { groupOrdersBySection, OrderSection } from './sectionBucketing'
import { OrderCard } from './OrderCard'
import { Icon } from '../../shared/ui/icons/Icon'

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

const Column = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
`

const Section = styled.section`
  flex-shrink: 0;
`

const SectionHeader = styled.button`
  width: 100%;
  padding: 8px 12px;
  border: none;
  border-bottom: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--ink-2);
  font-size: var(--fs-caption);
  font-weight: var(--fw-extra);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  cursor: pointer;
  text-align: left;
  display: flex;
  align-items: center;
  gap: 6px;

  &:hover {
    background: var(--surface-3);
  }
`

const Chevron = styled.span<{ $expanded: boolean }>`
  display: inline-flex;
  color: var(--ink-3);
  transform: rotate(${({ $expanded }) => ($expanded ? '90deg' : '0deg')});
  transition: transform var(--dur-press);
`

const SectionLabel = styled.span`
  flex: 1;
`

const SectionBadge = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  background: var(--surface);
  color: var(--ink-2);
  border: 1px solid var(--line);
  border-radius: var(--r-pill);
  font-size: 11px;
  font-weight: var(--fw-extra);
`

const SectionContent = styled.div`
  padding: 4px 12px 8px;
`

const EmptySection = styled.p`
  font-size: var(--fs-caption);
  color: var(--ink-3);
  text-align: center;
  padding: 8px;
`

const LoadingMsg = styled.p`
  text-align: center;
  padding: 16px;
  color: var(--ink-2);
  font-size: var(--fs-label);
`

// ---------------------------------------------------------------------------
// Active statuses to query from the server
// ---------------------------------------------------------------------------

const ACTIVE_STATUSES = ['New', 'Assigned', 'Accepted', 'Arrived', 'InProgress', 'Completed']

/** Section display order and i18n key mapping. */
const SECTION_CONFIG: { section: OrderSection; labelKey: string; defaultCollapsed: boolean }[] = [
  { section: OrderSection.Nove, labelKey: 'board.sections.nove', defaultCollapsed: false },
  { section: OrderSection.Prirazene, labelKey: 'board.sections.prirazene', defaultCollapsed: false },
  { section: OrderSection.Probihajici, labelKey: 'board.sections.probihajici', defaultCollapsed: false },
  { section: OrderSection.Naplanovane, labelKey: 'board.sections.naplanovane', defaultCollapsed: false },
  { section: OrderSection.DokonceneDnes, labelKey: 'board.sections.dokonceneDnes', defaultCollapsed: true },
]

/** The middle column — active orders grouped by section. */
export function OrdersColumn() {
  const { t } = useTranslation()
  const now = new Date()

  // Collapsed state keyed by section id
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    for (const cfg of SECTION_CONFIG) {
      if (cfg.defaultCollapsed) initial[cfg.section] = true
    }
    return initial
  })

  const { data, isLoading } = useQuery({
    queryKey: ['orders', 'list', { statuses: ACTIVE_STATUSES }],
    queryFn: () => getOrders({ status: ACTIVE_STATUSES, pageSize: 200 }),
    // Polling fallback — B6 (SignalR) will invalidate instead when connected
    refetchInterval: 10_000,
    staleTime: 5_000,
  })

  // Shared driver list — same query key as DriverPicker so it uses the same cache entry
  const { data: driversData } = useQuery({
    queryKey: ['drivers'],
    queryFn: getDrivers,
    staleTime: 30_000,
  })

  // Build id→displayName map so OrderCard can display driver names
  const driverNameById = new Map<string, string>()
  for (const d of driversData?.items ?? []) {
    driverNameById.set(d.driverId, d.displayName)
  }

  const grouped: Map<OrderSection, OrderSummaryDto[]> = data
    ? groupOrdersBySection(data.items, now)
    : new Map()

  function toggleSection(section: OrderSection) {
    setCollapsed(prev => ({ ...prev, [section]: !prev[section] }))
  }

  if (isLoading) {
    return <LoadingMsg>{t('app.loading')}</LoadingMsg>
  }

  return (
    <Column>
      {SECTION_CONFIG.map(({ section, labelKey }) => {
        const orders = grouped.get(section) ?? []
        const isCollapsed = collapsed[section] ?? false

        return (
          <Section key={section} aria-label={t(labelKey)}>
            <SectionHeader
              type="button"
              onClick={() => toggleSection(section)}
              aria-expanded={!isCollapsed}
            >
              <Chevron $expanded={!isCollapsed}>
                <Icon name="chevron" size={14} />
              </Chevron>
              <SectionLabel>{t(labelKey)}</SectionLabel>
              {orders.length > 0 && <SectionBadge>{orders.length}</SectionBadge>}
            </SectionHeader>

            {!isCollapsed && (
              <SectionContent>
                {orders.length === 0 ? (
                  <EmptySection>—</EmptySection>
                ) : (
                  orders.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      driverName={order.driverId ? (driverNameById.get(order.driverId) ?? null) : null}
                    />
                  ))
                )}
              </SectionContent>
            )}
          </Section>
        )
      })}
    </Column>
  )
}

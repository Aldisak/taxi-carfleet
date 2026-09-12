import { useState } from 'react'
import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { getOrders, getDrivers } from '../../shared/api/client'
import type { OrderSummaryDto } from '../../shared/api/client'
import { groupOrdersBySection, OrderSection } from './sectionBucketing'
import { OrderCard } from './OrderCard'

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
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  border: none;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.fontSizeXs};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
  text-align: left;
  display: flex;
  align-items: center;
  justify-content: space-between;

  &:hover {
    background: ${({ theme }) => theme.colors.border};
  }
`

const SectionBadge = styled.span`
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
  border-radius: ${({ theme }) => theme.borderRadius.full};
  font-size: ${({ theme }) => theme.typography.fontSizeXs};
  padding: 1px 6px;
  margin-left: ${({ theme }) => theme.spacing.xs};
`

const SectionContent = styled.div`
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
`

const EmptySection = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSizeXs};
  color: ${({ theme }) => theme.colors.textSecondary};
  text-align: center;
  padding: ${({ theme }) => theme.spacing.sm};
`

const LoadingMsg = styled.p`
  text-align: center;
  padding: ${({ theme }) => theme.spacing.md};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
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
              <span>
                {t(labelKey)}
                {orders.length > 0 && <SectionBadge>{orders.length}</SectionBadge>}
              </span>
              <span aria-hidden="true">{isCollapsed ? '▸' : '▾'}</span>
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

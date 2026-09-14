import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'
import './analyticsPrint.css'
import { AnalyticsControls } from './controls/AnalyticsControls'
import type { Granularity } from './controls/AnalyticsControls'
import { OverviewTab } from './overview/OverviewTab'
import { DemandTab } from './demand/DemandTab'
import { OperationsTab } from './operations/OperationsTab'
import { RevenueTab } from './revenue/RevenueTab'
import { DriversTab } from './drivers/DriversTab'
import { CustomersTab } from './customers/CustomersTab'
import { defaultThisMonthRange, presetRanges } from '../../shared/date/analyticsRange'
import type { RangePreset } from '../../shared/date/analyticsRange'
import type { AnalyticsOverviewParams } from '../../shared/api/client'

// ── Styled components ─────────────────────────────────────────────────────────

const Page = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
`

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.lg};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surface};
  flex-shrink: 0;
`

const TabList = styled.div`
  display: flex;
  gap: 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surface};
  padding: 0 ${({ theme }) => theme.spacing.lg};
  flex-shrink: 0;
  overflow-x: auto;
`

const TabButton = styled.button<{ $active: boolean }>`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border: none;
  border-bottom: 2px solid ${({ theme, $active }) => ($active ? theme.colors.primary : 'transparent')};
  background: none;
  color: ${({ theme, $active }) => ($active ? theme.colors.primary : theme.colors.text)};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  font-weight: ${({ theme, $active }) =>
    $active ? theme.typography.fontWeightMedium : theme.typography.fontWeightNormal};
  cursor: pointer;
  white-space: nowrap;

  &:hover {
    color: ${({ theme }) => theme.colors.primary};
    background: ${({ theme }) => theme.colors.background};
  }
`

const TabContent = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: ${({ theme }) => theme.spacing.lg};
`

const PlaceholderMessage = styled.p`
  color: ${({ theme }) => theme.colors.textSecondary};
  text-align: center;
  padding: ${({ theme }) => theme.spacing.xl};
`

// ── Tab definitions ────────────────────────────────────────────────────────────

type TabKey = 'prehled' | 'poptavka' | 'provoz' | 'trzby' | 'ridici' | 'zakaznici'

const TABS: TabKey[] = ['prehled', 'poptavka', 'provoz', 'trzby', 'ridici', 'zakaznici']

// ── Component ─────────────────────────────────────────────────────────────────

/** The /dispatcher/analytics page shell: tab nav + shared controls + routed tab content. */
export function AnalyticsPage() {
  const { t } = useTranslation()
  const now = new Date()
  const defaultRange = defaultThisMonthRange(now)

  const [activeTab, setActiveTab] = useState<TabKey>('prehled')
  const [preset, setPreset] = useState<RangePreset>('tentoMesic')
  const [from, setFrom] = useState(defaultRange.from)
  const [to, setTo] = useState(defaultRange.to)
  const [granularity, setGranularity] = useState<Granularity>('day')
  const [compare, setCompare] = useState(false)

  function handlePresetChange(newPreset: RangePreset) {
    setPreset(newPreset)
    if (newPreset !== 'vlastni') {
      const ranges = presetRanges(now)
      const selected = ranges[newPreset]
      if (selected) {
        setFrom(selected.from)
        setTo(selected.to)
      }
    }
  }

  const overviewParams: AnalyticsOverviewParams = { from, to, granularity, compare }

  return (
    <Page>
      {/* Shared controls toolbar */}
      <Toolbar className="analytics-toolbar">
        <AnalyticsControls
          preset={preset}
          onPresetChange={handlePresetChange}
          granularity={granularity}
          onGranularityChange={setGranularity}
          compare={compare}
          onCompareChange={setCompare}
        />
      </Toolbar>

      {/* Tab navigation */}
      <TabList role="tablist" aria-label={t('analytics.overview.title')}>
        {TABS.map(tab => (
          <TabButton
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            $active={activeTab === tab}
            onClick={() => setActiveTab(tab)}
          >
            {t(`analytics.tabs.${tab}`)}
          </TabButton>
        ))}
      </TabList>

      {/* Tab content */}
      <TabContent role="tabpanel">
        {activeTab === 'prehled' ? (
          <OverviewTab params={overviewParams} />
        ) : activeTab === 'poptavka' ? (
          <DemandTab params={overviewParams} />
        ) : activeTab === 'provoz' ? (
          <OperationsTab params={overviewParams} />
        ) : activeTab === 'trzby' ? (
          <RevenueTab params={overviewParams} />
        ) : activeTab === 'ridici' ? (
          <DriversTab params={overviewParams} />
        ) : activeTab === 'zakaznici' ? (
          <CustomersTab params={overviewParams} />
        ) : (
          <PlaceholderMessage>{t('analytics.tabs.placeholder')}</PlaceholderMessage>
        )}
      </TabContent>
    </Page>
  )
}

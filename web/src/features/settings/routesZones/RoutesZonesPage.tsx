import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'
import { ZonesTab } from './zones/ZonesTab'
import { RoutesTab } from './routes/RoutesTab'
import { PlacesTab } from './places/PlacesTab'

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
`

const SubTabBar = styled.div`
  display: flex;
  gap: 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surface};
  padding: 0 ${({ theme }) => theme.spacing.md};
`

const SubTabButton = styled.button<{ $active: boolean }>`
  min-height: ${({ theme }) => theme.touchTargets.min};
  padding: 0 ${({ theme }) => theme.spacing.md};
  border: none;
  background: none;
  cursor: pointer;
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  color: ${({ $active, theme }) => ($active ? theme.colors.primary : theme.colors.textSecondary)};
  border-bottom: 2px solid ${({ $active, theme }) => ($active ? theme.colors.primary : 'transparent')};
  margin-bottom: -1px;
`

const SubTabContent = styled.div`
  flex: 1;
  overflow: auto;
`

type SubTab = 'zones' | 'routes' | 'places'

/**
 * Dispatcher Settings → "Trasy a zóny" area. Hosts the Zóny (B2) / Trasy (B3) / Místa (B4)
 * sub-tabs, each a self-contained tab component. All three CRUD the A4/A5/A2 backend endpoints
 * via the shared client; Leaflet editors/pin-pickers are lazy per tab.
 */
export function RoutesZonesPage() {
  const { t } = useTranslation()
  const [subTab, setSubTab] = useState<SubTab>('zones')

  return (
    <Wrapper>
      <SubTabBar role="tablist" aria-label={t('settings.routesZones.title')}>
        <SubTabButton
          role="tab"
          aria-selected={subTab === 'zones'}
          $active={subTab === 'zones'}
          onClick={() => setSubTab('zones')}
        >
          {t('settings.routesZones.tabs.zones')}
        </SubTabButton>
        <SubTabButton
          role="tab"
          aria-selected={subTab === 'routes'}
          $active={subTab === 'routes'}
          onClick={() => setSubTab('routes')}
        >
          {t('settings.routesZones.tabs.routes')}
        </SubTabButton>
        <SubTabButton
          role="tab"
          aria-selected={subTab === 'places'}
          $active={subTab === 'places'}
          onClick={() => setSubTab('places')}
        >
          {t('settings.routesZones.tabs.places')}
        </SubTabButton>
      </SubTabBar>

      <SubTabContent>
        {subTab === 'zones' && <ZonesTab />}
        {subTab === 'routes' && <RoutesTab />}
        {subTab === 'places' && <PlacesTab />}
      </SubTabContent>
    </Wrapper>
  )
}

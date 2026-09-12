import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'
import { authStorage } from '../../shared/api/auth-storage'
import { canAccessSettings } from './roleGating'
import { VehiclesTab } from './VehiclesTab'
import { PeopleTab } from './PeopleTab'
import { FleetTab } from './FleetTab'
import { RoutesZonesPage } from './routesZones/RoutesZonesPage'

const Page = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
`

const TabBar = styled.div`
  display: flex;
  gap: 0;
  border-bottom: 2px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surface};
  padding: 0 ${({ theme }) => theme.spacing.md};
`

const TabButton = styled.button<{ $active: boolean }>`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border: none;
  background: none;
  cursor: pointer;
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  color: ${({ $active, theme }) => $active ? theme.colors.primary : theme.colors.textSecondary};
  border-bottom: 2px solid ${({ $active, theme }) => $active ? theme.colors.primary : 'transparent'};
  margin-bottom: -2px;
  transition: color 0.1s;

  &:hover {
    color: ${({ theme }) => theme.colors.primary};
  }
`

const TabContent = styled.div`
  flex: 1;
  overflow: auto;
`

const AccessDenied = styled.div`
  padding: ${({ theme }) => theme.spacing.xl};
  text-align: center;
  color: ${({ theme }) => theme.colors.textSecondary};
`

type Tab = 'vehicles' | 'people' | 'fleet' | 'routesZones'

/** Settings page — FleetAdmin only. Shows Vozidla / Lidé / Fleet tabs. */
export function SettingsPage() {
  const { t } = useTranslation()
  const role = authStorage.getUserRole()
  const [activeTab, setActiveTab] = useState<Tab>('vehicles')

  if (!canAccessSettings(role)) {
    return (
      <Page>
        <AccessDenied role="alert" data-testid="settings-access-denied">
          {t('settings.accessDenied')}
        </AccessDenied>
      </Page>
    )
  }

  return (
    <Page>
      <TabBar role="tablist">
        <TabButton
          role="tab"
          aria-selected={activeTab === 'vehicles'}
          $active={activeTab === 'vehicles'}
          onClick={() => setActiveTab('vehicles')}
        >
          {t('settings.tabs.vehicles')}
        </TabButton>
        <TabButton
          role="tab"
          aria-selected={activeTab === 'people'}
          $active={activeTab === 'people'}
          onClick={() => setActiveTab('people')}
        >
          {t('settings.tabs.people')}
        </TabButton>
        <TabButton
          role="tab"
          aria-selected={activeTab === 'fleet'}
          $active={activeTab === 'fleet'}
          onClick={() => setActiveTab('fleet')}
        >
          {t('settings.tabs.fleet')}
        </TabButton>
        <TabButton
          role="tab"
          aria-selected={activeTab === 'routesZones'}
          $active={activeTab === 'routesZones'}
          onClick={() => setActiveTab('routesZones')}
        >
          {t('settings.tabs.routesZones')}
        </TabButton>
      </TabBar>

      <TabContent>
        {activeTab === 'vehicles' && <VehiclesTab />}
        {activeTab === 'people' && <PeopleTab />}
        {activeTab === 'fleet' && <FleetTab />}
        {activeTab === 'routesZones' && <RoutesZonesPage />}
      </TabContent>
    </Page>
  )
}

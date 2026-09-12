import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import type { NavApp } from './driverSettings'

const Section = styled.section`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  padding: ${({ theme }) => theme.spacing.md};
`

const Title = styled.h2`
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  color: ${({ theme }) => theme.colors.text};
  margin: 0 0 ${({ theme }) => theme.spacing.sm} 0;
`

const Options = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`

const Option = styled.button<{ $selected: boolean }>`
  display: flex;
  align-items: center;
  min-height: ${({ theme }) => theme.touchTargets.min};
  padding: 0 ${({ theme }) => theme.spacing.md};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  text-align: left;
  border: 2px solid
    ${({ theme, $selected }) => ($selected ? theme.colors.primary : theme.colors.border)};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  background: ${({ theme, $selected }) => ($selected ? theme.colors.primary : theme.colors.surface)};
  color: ${({ theme, $selected }) => ($selected ? '#ffffff' : theme.colors.text)};
  font-weight: ${({ theme, $selected }) =>
    $selected ? theme.typography.fontWeightBold : theme.typography.fontWeightNormal};
  cursor: pointer;
`

const NAV_APPS: readonly { value: NavApp; labelKey: string }[] = [
  { value: 'geo', labelKey: 'driver.settings.navAppGeo' },
  { value: 'google', labelKey: 'driver.settings.navAppGoogle' },
  { value: 'mapy', labelKey: 'driver.settings.navAppMapy' },
  { value: 'waze', labelKey: 'driver.settings.navAppWaze' },
]

interface NavAppPreferenceProps {
  value: NavApp
  onChange: (pref: NavApp) => void
}

/** Navigation-app preference selector consumed by the B-ride nav handoff (getNavAppPreference). */
export function NavAppPreference({ value, onChange }: NavAppPreferenceProps) {
  const { t } = useTranslation()

  return (
    <Section>
      <Title>{t('driver.settings.navAppTitle')}</Title>
      <Options role="radiogroup" aria-label={t('driver.settings.navAppTitle')}>
        {NAV_APPS.map(app => (
          <Option
            key={app.value}
            type="button"
            role="radio"
            aria-checked={value === app.value}
            $selected={value === app.value}
            onClick={() => onChange(app.value)}
          >
            {t(app.labelKey)}
          </Option>
        ))}
      </Options>
    </Section>
  )
}

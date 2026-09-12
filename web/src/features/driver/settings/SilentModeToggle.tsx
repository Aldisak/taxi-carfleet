import styled from 'styled-components'
import { useTranslation } from 'react-i18next'

const Section = styled.section`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  padding: ${({ theme }) => theme.spacing.md};
`

const Row = styled.label`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.md};
  min-height: ${({ theme }) => theme.touchTargets.min};
  cursor: pointer;
`

const Text = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`

const Title = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
  color: ${({ theme }) => theme.colors.text};
`

const Description = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.textSecondary};
`

const Checkbox = styled.input`
  width: 28px;
  height: 28px;
  flex-shrink: 0;
`

interface SilentModeToggleProps {
  value: boolean
  onChange: (enabled: boolean) => void
}

/** "Tichý režim" toggle — suppresses the offer sound/vibration (shared 'driver_silent_mode' key). */
export function SilentModeToggle({ value, onChange }: SilentModeToggleProps) {
  const { t } = useTranslation()

  return (
    <Section>
      <Row>
        <Text>
          <Title>{t('driver.settings.silentModeTitle')}</Title>
          <Description>{t('driver.settings.silentModeDescription')}</Description>
        </Text>
        <Checkbox
          type="checkbox"
          checked={value}
          onChange={e => onChange(e.target.checked)}
          aria-label={t('driver.settings.silentModeTitle')}
        />
      </Row>
    </Section>
  )
}
